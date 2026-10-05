window.probe = () => ({
  isolated: crossOriginIsolated,
  shared: typeof SharedArrayBuffer === 'function',
  evaluates: new Function('return 1 + 1')() === 2,
});
