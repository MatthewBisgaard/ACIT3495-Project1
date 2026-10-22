import express from "express";
import session from "express-session";
import http from 'http';
import { createReadStream, statSync } from "node:fs";
import cookieParser from 'cookie-parser';
import { requiresAuth, loginMiddleware } from './helper/auth';
import { dbcon, queryDatabase } from "./helper/db";

const app = express();

app.use(cookieParser());

// app.use(session({
//     store: new SqliteStore({
//         client: db,
//         expired: {
//             clear: true,
//             intervalMs: 900000
//         }
//     }),
//     secret: ""+process.env["sessionsecret"],
//     resave: true,
//     saveUninitialized: false, // MEans session data will only be saved if in use
//     cookie: {
//         httpOnly: true,
//         secure: false,
//         maxAge: 1000 * 60 * 60 * 3
//     }
// }))

app.get("/", requiresAuth, (req, res) => {
    res.render("home");
})

app.get("/login", (req, res) => {
    res.render("login");
})

app.post("/login", loginMiddleware, async (req, res) => {
    res.redirect("/");
});

app.get("/watch/:vidid", requiresAuth, async (req, res) => {
    const videoId = req.params.videoId;
    const currentVideo = await queryDatabase("SELECT * FROM Video WHERE id = ?", [])
    if (currentVideo.length < 1){
        res.send(404)
    }
    res.render("player", currentVideo[0]);
});

const CHUNK_SIZE = 10 ** 6;
app.get("/stream/:vidid", requiresAuth, async (req, res) => {
    http.get(`http://storage:3000/files/${req.params.vidid}`, {
        headers: req.headers
    }, resStorage => {
        resStorage.pipe(res)
    });
})

/*
router.get("/stream/:mediaFile", isAuthenticated, async (req, res) => {
    try{
        const range = req.headers.range;
        const videopath = `assets/${req.params.mediaFile}`;
        const videoSize = statSync(videopath).size;
        const start = Number(range?.replace(/\D/g, ""));
        const end = Math.min(start + CHUNK_SIZE, videoSize - 1 );
        const contentLength = end - start + 1;
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4"
        }
        res.writeHead(206, headers)
        const stream = createReadStream(videopath, { start, end }) 
        stream.pipe(res);

    }catch (err){
        res.sendStatus(500)
    }

});
*/