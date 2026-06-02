import React from 'react';
import { motion } from 'framer-motion';
import classNames from 'classnames';

export const Button = React.forwardRef(({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  children,
  className,
  ...props
}, ref) => {
  const baseClasses = 'btn-base font-medium transition-all duration-200';

  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <motion.button
      ref={ref}
      whileHover={!disabled && !loading ? { scale: 1.02 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.95 } : undefined}
      className={classNames(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        {
          'opacity-50 cursor-not-allowed': disabled || loading,
        },
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin">⭐</span>
          {children}
        </span>
      ) : (
        children
      )}
    </motion.button>
  );
});

Button.displayName = 'Button';
