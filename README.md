# llm-powered sentiment intelligence pipeline

a dual-stage analysis architecture that processes large volumes of customer feedback data. it performs instantaneous sentiment classification using lightweight neural networks, and routes complex negative feedback to large language models (qwen) to synthesize actionable resolutions without storing permanent data.

## tech stack
- frontend: next.js, react, vanilla css
- backend: python serverless functions
- ai/nlp: hugging face inference api (distilbert & qwen2.5-72b-instruct)
- deployment: vercel native

## usage (local development)

1. start the python backend proxy:
```bash
python -c "import http.server; from api.analyze import handler; server = http.server.HTTPServer(('', 8000), handler); print('api server started'); server.serve_forever()"
```

2. start the next.js ui block:
```bash
npm install
npm run dev
```

open http://localhost:3000. 
note: the engine requires a valid hugging face access token on the client interface to connect to the models.

## deployment
fully configured for vercel deployments via `vercel.json` and a lightweight `requirements.txt`. push your repository to github and import directly to vercel. no additional build configurations are required.

## license
© 2026 asil doğan gümüş. all rights reserved.
this project and its source code are the intellectual property of asil doğan gümüş. no part of this architecture may be reproduced, distributed, or transmitted in any form without prior written permission.

