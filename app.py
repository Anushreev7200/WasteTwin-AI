import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
ENABLE_REKOGNITION = os.environ.get("ENABLE_REKOGNITION", "false").lower() == "true"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3 = boto3.client("s3")
rekognition = boto3.client("rekognition")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def json_safe(value):
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    return value


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(json_safe(body))
    }


def priority_for(severity, created_at, category):
    weights = {"Low": 10, "Medium": 25, "High": 40, "Critical": 55}
    try:
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_hours = max(0, (datetime.now(timezone.utc) - created).total_seconds() / 3600)
    except Exception:
        age_hours = 0
    age_bonus = min(30, int(age_hours // 6) * 3)
    category_bonus = 15 if category.lower() in ("hazardous", "illegal dumping") else 0
    score = weights.get(severity, 25) + age_bonus + category_bonus
    label = "Critical" if score >= 75 else "High" if score >= 50 else "Medium" if score >= 25 else "Low"
    return score, label


def maybe_analyse_photo(photo_key):
    if not ENABLE_REKOGNITION or not photo_key:
        return []
    try:
        result = rekognition.detect_labels(
            Image={"S3Object": {"Bucket": BUCKET_NAME, "Name": photo_key}},
            MaxLabels=8,
            MinConfidence=70
        )
        return [{"name": item["Name"], "confidence": round(item["Confidence"], 1)}
                for item in result.get("Labels", [])]
    except Exception:
        # A failed optional analysis must not prevent a complaint being submitted.
        return []


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")
    try:
        if method == "GET" and path.endswith("/reports"):
            items = table.scan().get("Items", [])
            items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
            for item in items:
                item["priorityScore"], item["priority"] = priority_for(
                    item.get("severity", "Medium"), item.get("createdAt", now_iso()), item.get("category", "")
                )
            return response(200, {"reports": items})

        if method == "POST" and path.endswith("/upload-url"):
            body = json.loads(event.get("body") or "{}")
            filename = os.path.basename(body.get("filename", "waste-photo.jpg"))
            content_type = body.get("contentType", "image/jpeg")
            if not content_type.startswith("image/"):
                return response(400, {"error": "Only image uploads are allowed."})
            key = f"reports/{uuid.uuid4()}-{filename[:80]}"
            url = s3.generate_presigned_url(
                "put_object", Params={"Bucket": BUCKET_NAME, "Key": key, "ContentType": content_type},
                ExpiresIn=300
            )
            return response(200, {"uploadUrl": url, "photoKey": key, "photoUrl": f"s3://{BUCKET_NAME}/{key}"})

        if method == "POST" and path.endswith("/reports"):
            body = json.loads(event.get("body") or "{}")
            required = ["title", "description", "category", "severity", "location"]
            missing = [field for field in required if not str(body.get(field, "")).strip()]
            if missing:
                return response(400, {"error": "Missing required fields", "fields": missing})
            report_id = str(uuid.uuid4())
            created_at = now_iso()
            item = {
                "reportId": report_id,
                "title": str(body["title"])[:120],
                "description": str(body["description"])[:1200],
                "category": str(body["category"])[:60],
                "severity": str(body["severity"]),
                "location": str(body["location"])[:240],
                "latitude": Decimal(str(body["latitude"])) if body.get("latitude") not in (None, "") else None,
                "longitude": Decimal(str(body["longitude"])) if body.get("longitude") not in (None, "") else None,
                "status": "Reported",
                "createdAt": created_at,
                "updatedAt": created_at,
                "photoKey": body.get("photoKey", ""),
                "photoUrl": "",
                "aiLabels": maybe_analyse_photo(body.get("photoKey", ""))
            }
            item["priorityScore"], item["priority"] = priority_for(item["severity"], created_at, item["category"])
            # Remove nulls because DynamoDB does not accept Python None as a numeric value.
            item = {k: v for k, v in item.items() if v is not None}
            table.put_item(Item=item)
            return response(201, {"report": item})

        if method == "PATCH" and "/reports/" in path:
            report_id = path.rstrip("/").split("/")[-1]
            body = json.loads(event.get("body") or "{}")
            allowed_statuses = {"Reported", "Pending Verification", "In Progress", "Resolved"}
            status = body.get("status")
            if status not in allowed_statuses:
                return response(400, {"error": "Invalid status", "allowed": sorted(allowed_statuses)})
            existing = table.get_item(Key={"reportId": report_id}).get("Item")
            if not existing:
                return response(404, {"error": "Report not found"})
            table.update_item(
                Key={"reportId": report_id},
                UpdateExpression="SET #st = :s, updatedAt = :u",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":s": status, ":u": now_iso()}
            )
            return response(200, {"reportId": report_id, "status": status})

        return response(404, {"error": "Route not found"})
    except Exception as exc:
        print(f"Request failed: {type(exc).__name__}: {exc}")
        return response(500, {"error": "Internal server error. Check the Lambda CloudWatch logs."})
