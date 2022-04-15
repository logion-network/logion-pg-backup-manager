#!/bin/bash

set -e

# Delete DB
docker-compose stop lpbm
docker-compose stop private-database
docker-compose rm -f private-database
sudo rm -rf db_data # Deletes DB state

# Restore the DB
docker-compose up -d private-database
sleep 1 # Wait for postgres to be ready
echo "Restore" | sudo tee db_backup/command.txt > /dev/null # Trigger Restore on next backup manager trigger
docker-compose start lpbm
