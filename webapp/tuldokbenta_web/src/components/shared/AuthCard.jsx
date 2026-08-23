// components/shared/AuthCard.jsx

/**
 * The centred card Login and ChangePassword are rendered in.
 *
 * These two are the only pages outside the nav shell — a signed-out user has no
 * navigation to show — so they cannot lean on the page chrome for a heading or a
 * width, and would otherwise each invent their own. The card matches the panel
 * in components/shared/Modal so the app looks the same before and after signing
 * in.
 */
const AuthCard = ({ title, subtitle, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-10 transition-colors">
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3">
        <img
          src="/Spincredible.png"
          alt=""
          className="h-14 w-14 rounded-xl object-contain"
        />
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-6 space-y-4">
        {children}
      </div>
    </div>
  </div>
);

export default AuthCard;
