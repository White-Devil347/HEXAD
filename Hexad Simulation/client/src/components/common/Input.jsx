import React from 'react';
import classNames from 'classnames';

export const Input = React.forwardRef(({
  label,
  error,
  type = 'text',
  className,
  containerClassName,
  ...props
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-slate-200 mb-2">
          {label}
        </label>
      )}
      <input
        ref={ref}
        type={type}
        className={classNames(
          'input-base',
          {
            'border-error focus:border-error focus:ring-error': error,
          },
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-error text-sm mt-1">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
