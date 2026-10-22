# Video Streaming
This service provides the method for users to browse and watch videos. It uses HTTP streaming to bridge the raw video data from storage to the user, while providing the users browser with to tools to interpret the stream.

The streamer is safely ephemeral, it can be restarted with user data remaining.
# Routes
| Route | Function |
|-------|----------|
| `/` | Homepage for the application which lists videos |
| `/login` GET | Serves a login and registration page |
| `/login` POST | Handles login data to authenticate the user |
| `/signup` POST | Handles new credentials to register a user |
| `/logout` GET | Ends a users session with the streamer |
| `/watch/:videoID` GET | Serves the media player web page |
| `/stream/:vidStorageKey` GET | Serves the video data to the users browser in chunks so they can scrub |

# Configuration
- Serves on port 3000
## Required Environment Variables
- `DATABASE_HOST`: Hostname of the MySQL server
- `MYSQL_USER`: User to connect to the database server as
- `MYSQL_PASSWORD`: Password for the database user
- `DATABASE_SCHEMA`: Schema for the app to use
- `AUTH_URL`: Base URL for the authentication service
- `STORAGE_URL`: Base URL for the storage service

