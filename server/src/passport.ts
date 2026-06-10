// Configures Passport local strategy with bcrypt verification, serialize/deserialize
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { User } from "./models/User";

// Verify email/password credentials and return the matching user document
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        if (typeof email !== "string" || typeof password !== "string") {
          return done(null, false, { message: "Invalid email or password" });
        }

        const user = await User.findOne({ email });
        if (!user) return done(null, false, { message: "Invalid email or password" });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid email or password" });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Store only the user ID in the session cookie
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Reload full user document from DB on every authenticated request
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

export default passport;
