import React from "react";

export default function Section({ title, children, right }) {
  return (
    <section className="max-w-7xl mx-auto px-0 py-6">
      <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          {right}
        </div>
        {children}
      </div>
    </section>
  );
}
