#!/bin/sh
# Self-host every Manykiln tool and app on this machine (needs git and Docker with compose).
set -e
cd "$(dirname "$0")"
mkdir -p apps web
cp -r tools index.html web/ 2>/dev/null || true
[ -d apps/againface ] || git clone --depth 1 https://github.com/jiggleangelo/againface.git apps/againface
[ -d apps/agentlatch ] || git clone --depth 1 https://github.com/jiggleangelo/agentlatch.git apps/agentlatch
[ -d apps/cedarquill ] || git clone --depth 1 https://github.com/jiggleangelo/cedarquill.git apps/cedarquill
[ -d apps/creeldeck ] || git clone --depth 1 https://github.com/jiggleangelo/creeldeck.git apps/creeldeck
[ -d apps/datalineage ] || git clone --depth 1 https://github.com/jiggleangelo/datalineage.git apps/datalineage
[ -d apps/daygive ] || git clone --depth 1 https://github.com/jiggleangelo/daygive.git apps/daygive
[ -d apps/grantlatch ] || git clone --depth 1 https://github.com/jiggleangelo/grantlatch.git apps/grantlatch
[ -d apps/handledger ] || git clone --depth 1 https://github.com/jiggleangelo/handledger.git apps/handledger
[ -d apps/hearthline ] || git clone --depth 1 https://github.com/jiggleangelo/hearthline.git apps/hearthline
[ -d apps/hushwindow ] || git clone --depth 1 https://github.com/jiggleangelo/hushwindow.git apps/hushwindow
[ -d apps/kinrota ] || git clone --depth 1 https://github.com/jiggleangelo/kinrota.git apps/kinrota
[ -d apps/lanternkeep ] || git clone --depth 1 https://github.com/jiggleangelo/lanternkeep.git apps/lanternkeep
[ -d apps/limitlatch ] || git clone --depth 1 https://github.com/jiggleangelo/limitlatch.git apps/limitlatch
[ -d apps/marginmesh ] || git clone --depth 1 https://github.com/jiggleangelo/marginmesh.git apps/marginmesh
[ -d apps/mnemoport ] || git clone --depth 1 https://github.com/jiggleangelo/mnemoport.git apps/mnemoport
[ -d apps/norvelet ] || git clone --depth 1 https://github.com/jiggleangelo/norvelet.git apps/norvelet
[ -d apps/pausekin ] || git clone --depth 1 https://github.com/jiggleangelo/pausekin.git apps/pausekin
[ -d apps/quietbatch ] || git clone --depth 1 https://github.com/jiggleangelo/quietbatch.git apps/quietbatch
[ -d apps/quietoffer ] || git clone --depth 1 https://github.com/jiggleangelo/quietoffer.git apps/quietoffer
[ -d apps/quietrack ] || git clone --depth 1 https://github.com/jiggleangelo/quietrack.git apps/quietrack
[ -d apps/quillmirror ] || git clone --depth 1 https://github.com/jiggleangelo/quillmirror.git apps/quillmirror
[ -d apps/quillnest ] || git clone --depth 1 https://github.com/jiggleangelo/quillnest.git apps/quillnest
[ -d apps/quillvane ] || git clone --depth 1 https://github.com/jiggleangelo/quillvane.git apps/quillvane
[ -d apps/rebatelane ] || git clone --depth 1 https://github.com/jiggleangelo/rebatelane.git apps/rebatelane
[ -d apps/reviewtrail ] || git clone --depth 1 https://github.com/jiggleangelo/reviewtrail.git apps/reviewtrail
[ -d apps/ringspanner ] || git clone --depth 1 https://github.com/jiggleangelo/ringspanner.git apps/ringspanner
[ -d apps/rituwick ] || git clone --depth 1 https://github.com/jiggleangelo/rituwick.git apps/rituwick
[ -d apps/servobook ] || git clone --depth 1 https://github.com/jiggleangelo/servobook.git apps/servobook
[ -d apps/shelfcheck ] || git clone --depth 1 https://github.com/jiggleangelo/shelfcheck.git apps/shelfcheck
[ -d apps/shortlyne ] || git clone --depth 1 https://github.com/jiggleangelo/shortlyne.git apps/shortlyne
[ -d apps/siloscale ] || git clone --depth 1 https://github.com/jiggleangelo/siloscale.git apps/siloscale
[ -d apps/sixtable ] || git clone --depth 1 https://github.com/jiggleangelo/sixtable.git apps/sixtable
[ -d apps/skillward ] || git clone --depth 1 https://github.com/jiggleangelo/skillward.git apps/skillward
[ -d apps/slotlane ] || git clone --depth 1 https://github.com/jiggleangelo/slotlane.git apps/slotlane
[ -d apps/slotwise ] || git clone --depth 1 https://github.com/jiggleangelo/slotwise.git apps/slotwise
[ -d apps/tallyproof ] || git clone --depth 1 https://github.com/jiggleangelo/tallyproof.git apps/tallyproof
[ -d apps/undocart ] || git clone --depth 1 https://github.com/jiggleangelo/undocart.git apps/undocart
[ -d apps/vellumgrant ] || git clone --depth 1 https://github.com/jiggleangelo/vellumgrant.git apps/vellumgrant
docker compose up -d
echo "Open http://localhost:8080/ for the list of everything."
