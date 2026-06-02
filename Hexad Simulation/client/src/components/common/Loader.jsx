import React from 'react';
import { motion } from 'framer-motion';

export const Loader = ({ text = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="text-4xl"
      >
        ⬡
      </motion.div>
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  );
};

// Skeleton loading component
export const SkeletonCard = () => {
  return (
    <div className="card p-4">
      <div className="space-y-3">
        <div className="h-4 bg-slate-600 rounded skeleton"></div>
        <div className="h-4 bg-slate-600 rounded skeleton w-5/6"></div>
        <div className="h-4 bg-slate-600 rounded skeleton w-4/6"></div>
      </div>
    </div>
  );
};

export const SkeletonRow = () => {
  return (
    <div className="flex gap-4 p-4 border-b border-slate-600">
      <div className="h-10 w-20 bg-slate-600 rounded skeleton"></div>
      <div className="h-10 flex-1 bg-slate-600 rounded skeleton"></div>
      <div className="h-10 flex-1 bg-slate-600 rounded skeleton"></div>
    </div>
  );
};
