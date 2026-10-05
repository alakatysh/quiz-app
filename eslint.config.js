module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',   // Жовте попередження, якщо змінна створена, але не використовується
      'no-undef': 'error',         // Червона помилка, якщо викликається неіснуюча змінна
      'no-redeclare': 'error'     // Заборона повторного оголошення однієї й тієї ж змінної
    }
  }
];