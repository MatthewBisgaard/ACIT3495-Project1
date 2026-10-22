import { NextFunction, Response, Request } from "express";

const AUTH_URL = process.env.AUTH_URL ?? 'http://auth:3000';
// const JWT_SECRET = process.env.JWT_SECRET ?

const checkAuthentication = async (userJWT: String) => {
    const res = await fetch(`${AUTH_URL}/verify`, {headers: {Authorization: `Bearer ${userJWT}`}});
    return res.status === 200;
}

const requiresAuth = async (req: Request, res: Response, next: NextFunction) => {
    const userAuthToken: string | undefined = req.cookies?.token;
    if (userAuthToken){
        const userAuthorized = await checkAuthentication(userAuthToken);
        if (userAuthorized){
             return next()
        }
    }
    return res.redirect("/login");
}

// method: 'POST',
    // headers: { 'content-type': 'application/json' },
    // body: JSON.stringify(body),

const loginMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (req.body.username === undefined || req.body.password === undefined) return res.redirect("/login");
    const loginResult = await fetch(`${AUTH_URL}/login`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "username": req.body.username,
            "password": req.body.password 
        })
    });
    if (loginResult.status === 200){
        res.cookie('token', (await loginResult.json()).token, {
            maxAge: 36000,
            sameSite: "strict",
            httpOnly: true
        })
        return next();
    } else {
        return res.redirect("/login");
    }
};


export {
    requiresAuth,
    loginMiddleware
}