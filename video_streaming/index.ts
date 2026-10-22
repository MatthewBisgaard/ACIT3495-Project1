import express from "express";
import session from "express-session";
import http from 'http';
import { createReadStream, statSync } from "node:fs";
import cookieParser from 'cookie-parser';
import { requiresAuth, loginMiddleware, signupMiddleware } from './helper/auth';
import { queryDatabase } from "./helper/db";

const storageURL = process.env.STORAGE_URL ?? 'http://storage:3000'

const app = express();

app.set("view engine", "ejs"); 
app.use(express.urlencoded())
app.use(cookieParser());

app.get("/", requiresAuth, async (req, res) => {
    const allVids = await queryDatabase("SELECT title, Video.id, Video.createdAt, User.username FROM Video LEFT JOIN User ON Video.userID = User.id", []);
    console.log(allVids)
    res.render("home", {allVids});
})

app.get("/login", (req, res) => {
    res.render("login");
})

app.post("/login", loginMiddleware, async (req, res) => {
    res.redirect("/");
});

app.post("/logout", async (req, res) => {
    res.clearCookie('token');
    res.redirect("/login");
});

app.post("/signup", signupMiddleware)

app.get("/watch/:videoId", requiresAuth, async (req, res) => {
    const videoId = req.params.videoId;
    const currentVideo = await queryDatabase("SELECT * FROM Video WHERE id = ?", [videoId])
    console.log(currentVideo[0])
    if (currentVideo.length > 0){
        res.render("player", {currentVideo: currentVideo[0]});
    }
});

app.get("/stream/:vidStorageKey", requiresAuth, async (req, res) => {
    req.pause()
    const storageKey = req.params.vidStorageKey;
    // const currentVideo = await queryDatabase("SELECT * FROM Video WHERE id = ?", [])
    const headers = req.headers;
    headers['Range'] = req.headers.range;
    headers['Authorization'] = `${req.cookies?.token}`

    const clReq = http.get(`${storageURL}/files/${storageKey}`, {headers: headers}, async resStorage => {
        resStorage.pause()
        res.writeHead(resStorage.statusCode ?? 200, resStorage.headers)
        resStorage.pipe(res, {end: true})
    });
    req.pipe(clReq, {end: true})
})

app.get("/health", (req, res) => {
    res.send("Up");
})

app.listen(process.env.PORT ?? 3000, () => {
    console.log("Server Listening");
});