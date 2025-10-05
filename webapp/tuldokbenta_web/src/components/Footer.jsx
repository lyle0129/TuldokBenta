import React from 'react';

function Footer() {
  return (
    <footer className="w-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 py-4 mt-8 shadow-inner">
      <div className="max-w-7xl mx-auto text-center px-4 sm:px-6 lg:px-8">
        <p className="text-sm">
          © {new Date().getFullYear()} Lyle Denzell Trillanes. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
