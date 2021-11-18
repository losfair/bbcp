#!/bin/bash

set -euxo pipefail

./build.sh
RUST_LOG=info S3CMD_CFG=$CONFIG_PATH/s3.config ./scripts/build_and_upload.mjs \
  -f ./bbcp-build.tar \
  --mysql $CONFIG_PATH/mysql.json \
  --env $CONFIG_PATH/env.json \
  --s3_bucket "$S3_BUCKET" --s3_prefix rwcp/ # legacy compatibility
