"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Configures Passport local strategy with bcrypt verification, serialize/deserialize
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = require("passport-local");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = require("./models/User");
// Verify email/password credentials and return the matching user document
passport_1.default.use(new passport_local_1.Strategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
    try {
        const user = await User_1.User.findOne({ email });
        if (!user)
            return done(null, false, { message: "Invalid email or password" });
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok)
            return done(null, false, { message: "Invalid email or password" });
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
}));
// Store only the user ID in the session cookie
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
// Reload full user document from DB on every authenticated request
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const user = await User_1.User.findById(id);
        done(null, user ?? false);
    }
    catch (err) {
        done(err);
    }
});
exports.default = passport_1.default;
