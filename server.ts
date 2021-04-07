import express from "express";

async function run(port: number = 8080) {
    const app = express();
    app.use(express.static("./out"));
    app.use(express.static("./src"));
    app.listen(port, () => console.log(`Proxy running on port ${port}...`));
}

run();
