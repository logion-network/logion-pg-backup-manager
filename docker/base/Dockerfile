FROM node:16
WORKDIR /opt/logion-pg-backup-manager

RUN wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && echo "deb http://apt.postgresql.org/pub/repos/apt/ buster-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get -y --no-install-recommends install postgresql-client-12 && rm -rf /var/lib/apt/lists/*

RUN VERSION=0.14.5 \
    && FILE_NAME=ipfs-cluster-ctl_v${VERSION}_linux-amd64.tar.gz \
    && rm -f ${FILE_NAME} \
    && wget https://dist.ipfs.io/ipfs-cluster-ctl/v${VERSION}/${FILE_NAME} \
    && tar xzvf ${FILE_NAME} \
    && rm ${FILE_NAME}

RUN VERSION=0.12.0 \
    FILE_NAME=go-ipfs_v${VERSION}_linux-amd64.tar.gz \
    && wget https://dist.ipfs.io/go-ipfs/v${VERSION}/${FILE_NAME} \
    && tar xzvf ${FILE_NAME} \
    && rm ${FILE_NAME}

ENV IPFS_CLUSTER_CTL "/opt/logion-pg-backup-manager/ipfs-cluster-ctl/ipfs-cluster-ctl"
ENV IPFS "/opt/logion-pg-backup-manager/go-ipfs/ipfs"
ENV WORKING_DIRECTORY "/opt/logion-pg-backup-manager/work"
