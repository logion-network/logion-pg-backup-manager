#!/bin/bash

set -e

mkdir -p db_data
sudo chown -R 999:999 db_data # Make sure that the directory has proper ownership for the postgresql container
chmod 600 samples/.pgpass # Without this, the pg clients used by LPBM will fail
docker-compose up -d private-database # Let PostgreSQL initialize its data first, otherwise permission conflicts may happen
sleep 1
docker-compose up -d
