import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const { login, getDashboardPathForUser } = useAuth();
    const navigate = useNavigate();

    // Avoid showing previously-autofilled credentials when opening the login page.
    useEffect(() => {
        setEmail('');
        setPassword('');
        const t = setTimeout(() => {
            setEmail('');
            setPassword('');
        }, 50);
        return () => clearTimeout(t);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        
        try {
            const user = await login(email, password);

            const target = getDashboardPathForUser(user);
            if (target === '/login') {
                setError('Access denied. Teachers and Admins only.');
                return;
            }

            navigate(target);
        } catch (err) {
            const message =
                err?.response?.data?.message ||
                err?.message ||
                'Login failed. Please try again.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <h1>HEXAD</h1>
                    <p>Attendance Management System</p>
                </div>
                
                {error && (
                    <div className="alert alert-danger">
                        {error}
                    </div>
                )}
                
                <form onSubmit={handleSubmit} autoComplete="off">
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-input"
                            name="email"
                            autoComplete="off"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input"
                                name="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                style={{ paddingRight: '2.75rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                title={showPassword ? 'Hide password' : 'Show password'}
                                style={{
                                    position: 'absolute',
                                    right: '0.5rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0.25rem',
                                    cursor: 'pointer',
                                    color: 'var(--gray-600)'
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    
                    <button 
                        type="submit" 
                        className="btn btn-primary btn-lg" 
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
