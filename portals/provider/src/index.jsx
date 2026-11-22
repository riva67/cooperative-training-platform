import React from 'react';

export default function CompanyPortal() {
  return (
    <>
      {/* قسم الـ Head المخصص للـ React بواسطة React Helmet أو للعرض المباشر */}
      <div className="portal-container">
        <header>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <title>company-portal</title>
        </header>

        {/* محتوى الصفحات والمكونات */}
        <main>
          <h1>بوابة الشركة - Company Portal</h1>
        </main>
      </div>
    </>
  );
}