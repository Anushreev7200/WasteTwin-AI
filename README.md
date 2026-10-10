# WasteTwin AI — Smart Waste Reporting & Prioritisation

A practical hackathon MVP: citizens report waste with a photo and location; a serverless AWS backend stores reports and images, calculates priority, optionally analyses visible labels with Amazon Rekognition, and displays reports on a dashboard/map.

## Features
- Report form: title, description, category, severity, address, latitude/longitude, optional photo.
- AWS API Gateway + Lambda backend.
- DynamoDB stores reports and workflow status.
- S3 stores uploaded photos using short-lived presigned upload URLs.
- Optional Amazon Rekognition `DetectLabels` image analysis (must be enabled/configured; it is not a custom waste classifier).
- Priority score based on severity and unresolved age.
- Dashboard cards, filters, map pins, status updates, and refresh.
- Demo mode for frontend preview without AWS credentials. Demo data is clearly labelled and is not sent to AWS.

## Architecture
Browser (HTML/CSS/JS) → API Gateway HTTP API → Lambda (Python) → DynamoDB
                                                       ├→ S3 (photo uploads)
                                                       └→ Rekognition (optional labels)

## Requirements
- AWS account and AWS CLI configured (`aws configure`)
- AWS SAM CLI
- Python 3.12
- VS Code (recommended)
- Git

> AWS resources may incur charges. Use a test account, set an AWS Budget alert, and delete the stack after the hackathon.

## 1. Deploy backend with AWS SAM
Open this folder in VS Code. In the terminal:

```bash
sam build
sam deploy --guided
```

Suggested guided answers:
- Stack name: `wastetwin-ai`
- AWS Region: choose a nearby region supported by the services (for example `ap-south-1`, if available for your chosen services)
- Confirm changes before deploy: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Disable rollback: `N`
- Save arguments to configuration: `Y`

After deploy, copy the `ApiUrl`, `BucketName`, and `TableName` outputs from the terminal.

The Lambda receives `TABLE_NAME`, `BUCKET_NAME`, and `ENABLE_REKOGNITION` from the SAM template. If you want Rekognition, set `EnableRekognition` to `true` in `template.yaml` parameters and redeploy. Check that Rekognition is available in your selected region. Rekognition labels are indicative only and do not establish whether a site is hazardous or legally non-compliant.

## 2. Connect frontend to AWS
Edit `frontend/config.js` and set `API_BASE_URL` to the deployed `ApiUrl` (include the trailing slash if shown). Keep `DEMO_MODE = false`.

For a quick local run:
```bash
cd frontend
python -m http.server 5500
```
Open `http://localhost:5500`. Do not open `index.html` as a `file://` URL because browser requests and modules can behave differently.

## 3. Test workflow
1. Create a report with a real or test location.
2. Submit it. If you attach a photo, the browser requests a presigned S3 URL, uploads directly to S3, then submits the report record.
3. Confirm the report appears on the dashboard and map.
4. Change a report status to `In Progress` or `Resolved`.
5. Refresh the dashboard and confirm the status persists in DynamoDB.

If the API fails, check the browser DevTools console, API Gateway CORS settings, Lambda logs in CloudWatch, and the `ApiUrl` in `config.js`.

## 4. GitHub
Create an empty repository named `wastetwin-ai` on GitHub, then from this folder:

```bash
git init
git add .
git commit -m "Build WasteTwin AI AWS MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wastetwin-ai.git
git push -u origin main
```

Never commit AWS access keys, `.env` files, or private credentials. This project does not require credentials in frontend code.

## 5. Demo mode
Set `DEMO_MODE = true` in `frontend/config.js` to run a local UI demo without AWS. Demo mode uses browser local storage and sample reports, and shows a demo notice. It is not cloud-connected.

## Priority logic
Priority score = severity weight (Low 10, Medium 25, High 40, Critical 55) + unresolved-age bonus (up to 30) + category bonus (illegal dumping / hazardous 15). Scores map to Critical / High / Medium / Low. This is a transparent rule-based prioritiser, not a trained AI model.

## Important limitations
- Location fields are user-entered; the MVP does not silently collect GPS.
- Map tiles require internet access and use OpenStreetMap via Leaflet.
- Rekognition is optional and generic; it returns labels, not a validated waste-risk verdict.
- Add authentication/authorization before public production use. This hackathon MVP allows status changes without user login, so deploy only for a controlled demo.
