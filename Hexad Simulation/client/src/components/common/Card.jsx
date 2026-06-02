import React from 'react';
import { motion } from 'framer-motion';
import classNames from 'classnames';

export const Card = React.forwardRef(({
  children,
  className,
  hover = false,
  ...props
}, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={classNames(
        'card',
        {
          'card-hover': hover,
        },
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
});

Card.displayName = 'Card';
