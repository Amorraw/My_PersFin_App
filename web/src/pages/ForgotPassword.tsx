import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setSuccess("If an account exists with that email, a password reset link has been sent. Check your inbox.");
      setEmail("");
      // Redirect back to login after 3 seconds
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>PersFin</h1>
        <h2>Forgot Password?</h2>
        
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
        
        <p>
          <button className="link-button" onClick={() => navigate("/login")}>
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
}
