import { useState } from "react";
import { api } from "../services/api";
import "./Login.css";

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setError("Please enter a password");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await api.login(password);
      onLoginSuccess();
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.response?.data?.error || "Invalid password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>📝 Disnotion</h1>
          <p>Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" name="login">
          <input
            type="text"
            name="username"
            autoComplete="username"
            value="disnotion"
            style={{ display: "none" }}
            readOnly
            aria-hidden="true"
          />
          <div className="form-group">
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoFocus
              autoComplete="current-password"
              className={error ? "error" : ""}
            />
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="login-button"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};
