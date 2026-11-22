# Manykiln: every tool and app in one place

Free, open-source tools and small web apps made and run by AI agents at [Manykiln](https://manykiln.com/), with a person setting direction. Each one also has its own repo and page on manykiln.com.

## Run all of it on your machine

```sh
git clone https://github.com/jiggleangelo/manykiln.git && cd manykiln && ./run.sh
```

Needs git and Docker (with compose). Open http://localhost:8080/ for the list. Everything listens on 127.0.0.1 only. Each app keeps its data in its own Docker volume; `docker compose down -v` deletes it.

## What is inside

### In-browser tools (no server; nothing you type leaves the page)

- **Scam message check**: See which scam patterns a message matches. [Use online](https://manykiln.com/tools/scam-message-check/) · [Repo](https://github.com/jiggleangelo/scam-message-check)
- **Payload Shrinker**: Shrink JSON or text to fit a token budget. [Use online](https://manykiln.com/tools/prompt-payload-shrinker/) · [Repo](https://github.com/jiggleangelo/prompt-payload-shrinker)
- **QR Code Maker**: Make a QR code in your browser and download it as PNG or SVG. [Use online](https://manykiln.com/tools/qr-code-maker/) · [Repo](https://github.com/jiggleangelo/qr-code-maker)
- **PDF Merge Split**: Merge or split PDF files directly in your browser. [Use online](https://manykiln.com/tools/pdf-merge-split/) · [Repo](https://github.com/jiggleangelo/pdf-merge-split)
- **Image compress resize**: Compress and resize images in your browser. [Use online](https://manykiln.com/tools/image-compress-resize/) · [Repo](https://github.com/jiggleangelo/image-compress-resize)
- **DataLineage**: Check a declared dataset licence graph against a demo policy. [Use online](https://manykiln.com/tools/dataset-licence-check/) · [Repo](https://github.com/jiggleangelo/dataset-licence-check)
- **LimitLatch**: Simulate rolling API spend caps on made-up events. [Use online](https://manykiln.com/tools/spend-limit-simulator/) · [Repo](https://github.com/jiggleangelo/spend-limit-simulator)
- **CronPulse**: Compare two cron schedules and check for overlaps. [Use online](https://manykiln.com/tools/cronpulse/) · [Repo](https://github.com/jiggleangelo/cronpulse)
- **JSONPatchDiff**: Generate and test RFC 6902 JSON patches in your browser. [Use online](https://manykiln.com/tools/jsonpatchdiff/) · [Repo](https://github.com/jiggleangelo/jsonpatchdiff)
- **SemVerMatrix**: Compare version ranges that share one dependency, in your browser. [Use online](https://manykiln.com/tools/semvermatrix/) · [Repo](https://github.com/jiggleangelo/semvermatrix)
- **EnvSchema**: Check a .env file against a schema and compare it with a baseline. [Use online](https://manykiln.com/tools/envschema/) · [Repo](https://github.com/jiggleangelo/envschema)
- **IP & CIDR**: Calculate IPv4 and IPv6 ranges, masks and subnets in your browser. [Use online](https://manykiln.com/tools/ipcidr/) · [Repo](https://github.com/jiggleangelo/ipcidr)
- **WebhookReplay**: Compute and compare webhook HMAC signatures with test keys, in your browser. [Use online](https://manykiln.com/tools/webhookreplay/) · [Repo](https://github.com/jiggleangelo/webhookreplay)
- **CSVSchema**: Infer column types and a schema from CSV text in your browser. [Use online](https://manykiln.com/tools/csvschema/) · [Repo](https://github.com/jiggleangelo/csvschema)
- **RegexBench**: Lint a regular expression and count match work on your text. [Use online](https://manykiln.com/tools/regexbench/) · [Repo](https://github.com/jiggleangelo/regexbench)
- **JWTInspector**: Decode JWT headers and claims and lint them in your browser. [Use online](https://manykiln.com/tools/jwtinspector/) · [Repo](https://github.com/jiggleangelo/jwtinspector)
- **Queryfoldlet**: Format SQL and review read-only query risks in your browser. [Use online](https://manykiln.com/tools/queryfoldlet/) · [Repo](https://github.com/jiggleangelo/queryfoldlet)
- **b64hex**: Convert text between Base64, Hex, and URL formats in your browser. [Use online](https://manykiln.com/tools/b64hex/) · [Repo](https://github.com/jiggleangelo/b64hex)
- **URL Parse Kit**: Inspect, normalize and edit URI references in your browser. [Use online](https://manykiln.com/tools/urlparsekit/) · [Repo](https://github.com/jiggleangelo/urlparsekit)
- **Colorcontrast**: Check color pairs for WCAG and APCA contrast. [Use online](https://manykiln.com/tools/colorcontrast/) · [Repo](https://github.com/jiggleangelo/colorcontrast)
- **Httpref**: Analyze HTTP status codes and response headers in your browser. [Use online](https://manykiln.com/tools/httpref/) · [Repo](https://github.com/jiggleangelo/httpref)
- **Uuidkit**: Validate and generate UUIDs and ULIDs in your browser. [Use online](https://manykiln.com/tools/uuidkit/) · [Repo](https://github.com/jiggleangelo/uuidkit)
- **Yaml2json**: Converts YAML to JSON and back in your browser. [Use online](https://manykiln.com/tools/yaml2json/) · [Repo](https://github.com/jiggleangelo/yaml2json)
- **CSVclean**: Clean and convert CSV files in your browser. [Use online](https://manykiln.com/tools/csvclean/) · [Repo](https://github.com/jiggleangelo/csvclean)
- **Diffpatch**: Compare two texts line by line and inspect unified patches in your browser. [Use online](https://manykiln.com/tools/diffpatch/) · [Repo](https://github.com/jiggleangelo/diffpatch)
- **Certinspect**: Read X.509 certificate fields and chain order in your browser. [Use online](https://manykiln.com/tools/certinspect/) · [Repo](https://github.com/jiggleangelo/certinspect)
- **Schema Studio**: Inspect SQL DDL for structure, lint, and diff. [Use online](https://manykiln.com/tools/sqlschema/) · [Repo](https://github.com/jiggleangelo/sqlschema)
- **Hashmac**: Hash files and text with SHA-256, HMAC, and CRC32. [Use online](https://manykiln.com/tools/hashmac/) · [Repo](https://github.com/jiggleangelo/hashmac)
- **Marklinelet**: Check Markdown structure and preview it offline. [Use online](https://manykiln.com/tools/marklinelet/) · [Repo](https://github.com/jiggleangelo/marklinelet)
- **Toml2json**: Convert TOML and JSON in your browser with a typed mode for dates and big numbers. [Use online](https://manykiln.com/tools/toml2json/) · [Repo](https://github.com/jiggleangelo/toml2json)

### Apps (Python standard library, one container each)

- **Againface** (port 9001): Confirm the same person is there at risky moments. [Use online](https://manykiln.com/tools/againface/) · [Repo](https://github.com/jiggleangelo/againface)
- **Agentlatch** (port 9002): Test what each AI agent's policy allows or denies. [Use online](https://manykiln.com/tools/agentlatch/) · [Repo](https://github.com/jiggleangelo/agentlatch)
- **Cedarquill** (port 9003): Keep your HOA board's emails, cases and votes together. [Use online](https://manykiln.com/tools/cedarquill/) · [Repo](https://github.com/jiggleangelo/cedarquill)
- **Creeldeck** (port 9004): Keep your own trip records; type each trip once. [Use online](https://manykiln.com/tools/creeldeck/) · [Repo](https://github.com/jiggleangelo/creeldeck)
- **Datalineage** (port 9005): Trace training data licences before you release a model. [Use online](https://manykiln.com/tools/datalineage/) · [Repo](https://github.com/jiggleangelo/datalineage)
- **Daygive** (port 9006): Turn a free staff weekday into a community project. [Use online](https://manykiln.com/tools/daygive/) · [Repo](https://github.com/jiggleangelo/daygive)
- **Grantlatch** (port 9007): Scoped grants and action checks for AI agents. [Use online](https://manykiln.com/tools/grantlatch/) · [Repo](https://github.com/jiggleangelo/grantlatch)
- **Handledger** (port 9008): Keep a timestamped record of how you made your work. [Use online](https://manykiln.com/tools/handledger/) · [Repo](https://github.com/jiggleangelo/handledger)
- **Hearthline** (port 9009): Know how a parent living alone is doing. [Use online](https://manykiln.com/tools/hearthline/) · [Repo](https://github.com/jiggleangelo/hearthline)
- **Hushwindow** (port 9010): See after-hours work and hold messages that can wait. [Use online](https://manykiln.com/tools/hushwindow/) · [Repo](https://github.com/jiggleangelo/hushwindow)
- **Kinrota** (port 9011): See who covers a parent's care this week. [Use online](https://manykiln.com/tools/kinrota/) · [Repo](https://github.com/jiggleangelo/kinrota)
- **Lanternkeep** (port 9012): Check what an old app needs to stay alive. [Use online](https://manykiln.com/tools/lanternkeep/) · [Repo](https://github.com/jiggleangelo/lanternkeep)
- **Limitlatch** (port 9013): Set spend and refund limits for AI agents. [Use online](https://manykiln.com/tools/limitlatch/) · [Repo](https://github.com/jiggleangelo/limitlatch)
- **Marginmesh** (port 9014): Price an open model to cover GPU rent and margin. [Use online](https://manykiln.com/tools/marginmesh/) · [Repo](https://github.com/jiggleangelo/marginmesh)
- **Mnemoport** (port 9015): Carry your AI assistants' memory between them, and edit it. [Use online](https://manykiln.com/tools/mnemoport/) · [Repo](https://github.com/jiggleangelo/mnemoport)
- **Norvelet** (port 9016): Know apparel and packaging specs before you order. [Use online](https://manykiln.com/tools/norvelet/) · [Repo](https://github.com/jiggleangelo/norvelet)
- **Pausekin** (port 9017): Help your parents pause before acting on scam messages. [Use online](https://manykiln.com/tools/pausekin/) · [Repo](https://github.com/jiggleangelo/pausekin)
- **Quietbatch** (port 9018): Draft weekly posts and review replies; you approve. [Use online](https://manykiln.com/tools/quietbatch/) · [Repo](https://github.com/jiggleangelo/quietbatch)
- **Quietoffer** (port 9019): Draft polite offers for used goods, no haggling. [Use online](https://manykiln.com/tools/quietoffer/) · [Repo](https://github.com/jiggleangelo/quietoffer)
- **Quietrack** (port 9020): Search your documents with cited sentences, no AI. [Use online](https://manykiln.com/tools/quietrack/) · [Repo](https://github.com/jiggleangelo/quietrack)
- **Quillmirror** (port 9021): See what AI chatbots say about you. [Use online](https://manykiln.com/tools/quillmirror/) · [Repo](https://github.com/jiggleangelo/quillmirror)
- **Quillnest** (port 9022): Inbox assistant that drafts replies but cannot send. [Use online](https://manykiln.com/tools/quillnest/) · [Repo](https://github.com/jiggleangelo/quillnest)
- **Quillvane** (port 9023): Learn to build an online business, with feedback. [Use online](https://manykiln.com/tools/quillvane/) · [Repo](https://github.com/jiggleangelo/quillvane)
- **Rebatelane** (port 9024): Prepare expiring rebate credits for API customers. [Use online](https://manykiln.com/tools/rebatelane/) · [Repo](https://github.com/jiggleangelo/rebatelane)
- **Reviewtrail** (port 9025): See how an AI model performs on your task. [Use online](https://manykiln.com/tools/reviewtrail/) · [Repo](https://github.com/jiggleangelo/reviewtrail)
- **Ringspanner** (port 9026): Turn an after-hours message into a price and reply. [Use online](https://manykiln.com/tools/ringspanner/) · [Repo](https://github.com/jiggleangelo/ringspanner)
- **Rituwick** (port 9027): Plan a ceremony without a church or celebrant. [Use online](https://manykiln.com/tools/rituwick/) · [Repo](https://github.com/jiggleangelo/rituwick)
- **Servobook** (port 9028): Compare robot rental quotes and spot what is missing. [Use online](https://manykiln.com/tools/servobook/) · [Repo](https://github.com/jiggleangelo/servobook)
- **Shelfcheck** (port 9029): Is your Shopify store ready for AI shopping agents? [Use online](https://manykiln.com/tools/shelfcheck/) · [Repo](https://github.com/jiggleangelo/shelfcheck)
- **Shortlyne** (port 9030): Review 3 good marketing drafts, not 50 average ones. [Use online](https://manykiln.com/tools/shortlyne/) · [Repo](https://github.com/jiggleangelo/shortlyne)
- **Siloscale** (port 9031): Check if your datasets are ready to license. [Use online](https://manykiln.com/tools/siloscale/) · [Repo](https://github.com/jiggleangelo/siloscale)
- **Sixtable** (port 9032): Split sign-ups into groups of six that meet again. [Use online](https://manykiln.com/tools/sixtable/) · [Repo](https://github.com/jiggleangelo/sixtable)
- **Skillward** (port 9033): Review agent skills before your team installs them. [Use online](https://manykiln.com/tools/skillward/) · [Repo](https://github.com/jiggleangelo/skillward)
- **Slotlane** (port 9034): Check sponsored ad copy for AI agents and MCP apps. [Use online](https://manykiln.com/tools/slotlane/) · [Repo](https://github.com/jiggleangelo/slotlane)
- **Slotwise** (port 9035): Compare a used GPU with its listing. [Use online](https://manykiln.com/tools/slotwise/) · [Repo](https://github.com/jiggleangelo/slotwise)
- **Tallyproof** (port 9036): Show customers why each outcome charge happened. [Use online](https://manykiln.com/tools/tallyproof/) · [Repo](https://github.com/jiggleangelo/tallyproof)
- **Undocart** (port 9037): Find your deadline and next step when an AI order goes wrong. [Use online](https://manykiln.com/tools/undocart/) · [Repo](https://github.com/jiggleangelo/undocart)
- **Vellumgrant** (port 9038): Record what each performer agreed for digital replicas. [Use online](https://manykiln.com/tools/vellumgrant/) · [Repo](https://github.com/jiggleangelo/vellumgrant)

## Status and limits

Early versions built by AI agents. Examples are made up. Apps that call outside services in our hosted version may not do so here. Tests live in each tool's or app's own repo. Nothing is charged.

## Licence

MIT. Tools that include code from other open-source projects carry their notices in their own repos (THIRD_PARTY_NOTICES.md).
