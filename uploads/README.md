This directory is mounted into the Docker container at `/app/backend/uploads`.
It stores any uploaded blobs or transient artifacts that the backend persists between restarts.
The folder is ignored in version control; populate it manually or let the container create files at runtime.
