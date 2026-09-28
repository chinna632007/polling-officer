/**
 * Register.jsx
 * ===========
 * PUBLIC employee self-registration (no login, no approval workflow).
 * Employees fill in their details; the record goes straight into the
 * employees list (Officer collection) and is immediately visible to the
 * admin. Employees never receive credentials - only admins can log in.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../services/api';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';

const EMPTY_FORM = {
  officerName: '',
  designation: '',
  mobileNumber: '',
  email: '',
  mandal: '',
  district: '',
  houseNo: '',
  street: '',
  locality: '',
  ward: '',
  pinCode: '',
};

export default function Register() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null); // { officerId, officerName }

  const updateField = (e) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/api/officers/register', form);
      setSuccess(data?.data || {});
      setForm(EMPTY_FORM);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /** Small helper so the 11 fields stay declarative. ALL fields are required. */
  const field = (id, label, options = {}) => (
    <div className="form-group">
      <label htmlFor={id}>{label} <span className="req" aria-hidden="true">*</span></label>
      <input
        id={id}
        className="input"
        value={form[id]}
        onChange={updateField}
        placeholder={options.placeholder || ''}
        maxLength={options.maxLength}
        required
        autoComplete={options.autoComplete || 'off'}
      />
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-card login-card-wide">
        <div className="login-emblem">🗳️</div>
        <h1 className="login-title">Polling Duty - Employee Registration</h1>
        <p className="login-subtitle">
          Register your details for election duty allocation. No password needed.
        </p>

        {success ? (
          <div>
            <p style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>
              ✅ Registration successful!
            </p>
            <p className="login-subtitle">
              Your Employee ID - quote it whenever you contact the admin:
            </p>
            <div className="register-success-id">{success.officerId}</div>
            <div className="login-demo" style={{ marginTop: 12 }}>
              <div className="login-demo-grid">
                <span><strong>Name:</strong> {success.officerName}</span>
                <span>
                  Your details are now in the employees list. The admin will use
                  them for booth allocation and notifications.
                </span>
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-primary" onClick={() => setSuccess(null)}>
                Register another employee
              </button>
              <Link className="btn btn-secondary" to="/login">Admin login</Link>
            </div>
          </div>
        ) : (
          <>
            {error ? <Toast message={error} type="error" onClose={() => setError(null)} /> : null}

            <p className="register-note">
              All fields are required. After submitting, your details are added
              directly to the employees list (no approval step). You will NOT
              get a login account - only the admin logs in.
            </p>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                {field('officerName', 'Full Name', { maxLength: 80, autoComplete: 'name' })}
                {field('designation', 'Designation', { maxLength: 60 })}
                {field('mobileNumber', 'Mobile Number', { maxLength: 15, placeholder: '10-digit mobile', autoComplete: 'tel' })}
                {field('email', 'E-mail', { maxLength: 120, autoComplete: 'email' })}
                {field('mandal', 'Mandal', { maxLength: 60 })}
                {field('district', 'District', { maxLength: 60 })}
                {field('houseNo', 'House No.', { maxLength: 20 })}
                {field('street', 'Street', { maxLength: 80 })}
                {field('locality', 'Locality', { maxLength: 80 })}
                {field('ward', 'Ward', { maxLength: 30 })}
                {field('pinCode', 'PIN Code', { maxLength: 6, placeholder: '6 digits' })}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? <Spinner small label="Submitting…" /> : 'Submit registration'}
              </button>
            </form>

            <p className="login-foot">
              Admin? <Link to="/login">Log in here</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}