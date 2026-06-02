import { useNavigate } from 'react-router-dom';
import ReportForm from './ReportForm';

/**
 * Public capture page for users who are not logged in.
 *
 * The ReportForm detects the missing token and routes straight to the
 * offline queue. The queued item is sent automatically the next time the
 * user logs in and has network connectivity.
 */
export default function CaptureGuestPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-lg mx-auto pt-4 px-2">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <ReportForm
            onClose={() => navigate('/login')}
            onSubmitted={() => {}}
          />
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          הדיווח יישלח אוטומטית לאחר{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:underline"
          >
            כניסה למערכת
          </button>
        </p>
      </div>
    </div>
  );
}
