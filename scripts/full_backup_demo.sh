#!/bin/bash

set -e

echo "FullBackup" | sudo tee db_backup/command.txt > /dev/null # Trigger a Full Backup on next backup manager trigger
