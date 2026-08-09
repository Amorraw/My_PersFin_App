"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Express app entry point: middleware setup, route mounting, and server start
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const path_1 = __importDefault(require("path"));
const connect_mongo_1 = __importDefault(require("connect-mongo"));
const passport_1 = __importDefault(require("passport"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = require("./config");
require("./passport"); // configure local strategy, serialize/deserialize
const auth_1 = __importDefault(require("./routes/auth"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const accountTypes_1 = __importDefault(require("./routes/accountTypes"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const budgets_1 = __importDefault(require("./routes/budgets"));
const debts_1 = __importDefault(require("./routes/debts"));
const debtStrategies_1 = __importDefault(require("./routes/debtStrategies"));
const investmentRecommendations_1 = __importDefault(require("./routes/investmentRecommendations"));
const financialPlans_1 = __importDefault(require("./routes/financialPlans"));
const import_1 = __importDefault(require("./routes/import"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const categories_1 = __importDefault(require("./routes/categories"));
const tax_1 = __importDefault(require("./routes/tax"));
const goals_1 = __importDefault(require("./routes/goals"));
const netWorth_1 = __importDefault(require("./routes/netWorth"));
const bills_1 = __importDefault(require("./routes/bills"));
const properties_1 = __importDefault(require("./routes/properties"));
const gic_1 = __importDefault(require("./routes/gic"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const insurance_1 = __importDefault(require("./routes/insurance"));
const income_1 = __importDefault(require("./routes/income"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const reports_1 = __importDefault(require("./routes/reports"));
const recurring_1 = __importDefault(require("./routes/recurring"));
const plaid_1 = __importDefault(require("./routes/plaid"));
const ml_1 = __importDefault(require("./routes/ml"));
const demo_1 = __importDefault(require("./routes/demo"));
const setup_1 = __importDefault(require("./routes/setup"));
const fhsa_1 = __importDefault(require("./routes/fhsa"));
const resp_1 = __importDefault(require("./routes/resp"));
const tfsa_1 = __importDefault(require("./routes/tfsa"));
const rrsp_1 = __importDefault(require("./routes/rrsp"));
const scheduler_1 = require("./jobs/scheduler");
const app = (0, express_1.default)();
const isProd = process.env.NODE_ENV === "production";
// Render terminates TLS at the load balancer — trust proxy so cookies are secure
if (isProd)
    app.set("trust proxy", 1);
// ── 1. Static files served FIRST — no session/auth needed for assets ──────────
// __dirname at runtime = server/dist, so ../../web/dist = repo-root/web/dist
const frontendDist = path_1.default.join(__dirname, "../../web/dist");
if (isProd) {
    app.use(express_1.default.static(frontendDist));
}
// ── 2. CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    // Render injects RENDER_EXTERNAL_URL automatically — allows the app's own origin
    ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
];
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        // Allow server-to-server / Render health checks (no Origin) and listed origins
        if (!origin || allowedOrigins.includes(origin))
            cb(null, true);
        else
            cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
}));
// ── 3. Request logging ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
app.use(express_1.default.json({ limit: "50mb" }));
// ── 4. Session + Passport (API routes only need these) ───────────────────────
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const store = new connect_mongo_1.default({
    mongoUrl: config_1.MONGO_URI,
    ttl: SESSION_TTL_SEC,
    touchAfter: 24 * 3600,
});
store.on("error", (err) => {
    console.error("Session store error:", err);
});
app.use((0, express_session_1.default)({
    secret: config_1.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: "lax",
        maxAge: SESSION_TTL_SEC * 1000,
    },
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// ── 5. API routes ─────────────────────────────────────────────────────────────
app.use("/api/auth", auth_1.default);
app.use("/api/accounts", accounts_1.default);
app.use("/api/account-types", accountTypes_1.default);
app.use("/api/transactions", transactions_1.default);
app.use("/api/budgets", budgets_1.default);
app.use("/api/debts", debts_1.default);
app.use("/api/debt-strategies", debtStrategies_1.default);
app.use("/api/investment-recommendations", investmentRecommendations_1.default);
app.use("/api/financial-plans", financialPlans_1.default);
app.use("/api/import", import_1.default);
app.use("/api/analytics", analytics_1.default);
app.use("/api/categories", categories_1.default);
app.use("/api/tax-accounts", tax_1.default);
app.use("/api/goals", goals_1.default);
app.use("/api/net-worth", netWorth_1.default);
app.use("/api/bills", bills_1.default);
app.use("/api/properties", properties_1.default);
app.use("/api/gic", gic_1.default);
app.use("/api/portfolio", portfolio_1.default);
app.use("/api/insurance", insurance_1.default);
app.use("/api/income", income_1.default);
app.use("/api/notifications", notifications_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/recurring", recurring_1.default);
app.use("/api/plaid", plaid_1.default);
app.use("/api/ml", ml_1.default);
app.use("/api/demo", demo_1.default);
app.use("/api/setup", setup_1.default);
app.use("/api/fhsa", fhsa_1.default);
app.use("/api/resp", resp_1.default);
app.use("/api/tfsa-tracker", tfsa_1.default);
app.use("/api/rrsp-tracker", rrsp_1.default);
// ── 6. SPA fallback — must come before error handler ─────────────────────────
if (isProd) {
    app.get("/{*splat}", (_req, res) => {
        res.sendFile(path_1.default.join(frontendDist, "index.html"));
    });
}
// ── 7. Error handler — must be last ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({ message: err.message });
});
// Connect to MongoDB then start listening and kick off background jobs
mongoose_1.default.connect(config_1.MONGO_URI).then(() => {
    console.log("Mongo connected");
    app.listen(config_1.PORT, () => console.log(`API on http://localhost:${config_1.PORT}`));
    (0, scheduler_1.startScheduler)();
});
