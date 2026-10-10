# 3-minute hackathon demo script

1. **Problem (20 sec):** Waste complaints are often scattered across calls and messages, making it hard to prioritise and track resolution.
2. **Citizen report (40 sec):** Enter title, category, severity, location and coordinates; attach a photo if available; submit.
3. **Cloud architecture (30 sec):** Explain API Gateway receives requests, Lambda validates and scores, DynamoDB stores structured records, and S3 stores uploaded images using presigned URLs.
4. **Operations dashboard (40 sec):** Show report cards, priority score, search/status filters, and map pins. Explain that only reports with coordinates appear on the map.
5. **Accountability (30 sec):** Change a report to In Progress and then Resolved; refresh to show persisted status in AWS mode.
6. **Innovation and honesty (20 sec):** Priority is explainable rules, and optional Rekognition labels are image hints—not a validated waste-risk classifier. Demo mode is local sample data; AWS mode is cloud connected.

## Sample pitch
“WasteTwin AI turns community waste reports into a trackable operations workflow. Instead of claiming to detect every dump automatically, it starts with a reliable human-in-the-loop process: citizens submit evidence, the platform ranks reports transparently, and sanitation teams update status. The AWS serverless design scales without managing servers, while the map helps teams understand where attention is needed.”
