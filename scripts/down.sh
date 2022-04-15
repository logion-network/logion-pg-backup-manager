#!/bin/bash

set -e

docker-compose down
sudo rm -rf db_backup db_data
