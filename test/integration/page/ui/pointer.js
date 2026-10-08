const pointer = new URLSearchParams(location.search).get('pointer') ?? 'fine';
const real = window.matchMedia.bind(window);
window.matchMedia = (query) => {
  const list = real(query);
  const kind = query.trim().match(/^\(pointer:\s*(fine|coarse)\)$/)?.[1];
  if (kind) Object.defineProperty(list, 'matches', { value: kind === pointer });
  return list;
};
