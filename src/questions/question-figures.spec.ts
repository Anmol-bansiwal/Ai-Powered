import { uniqueFigureUrls } from './question-figures';

describe('uniqueFigureUrls', () => {
  it('keeps Cloudinary and Nest figure paths', () => {
    expect(
      uniqueFigureUrls([
        'https://res.cloudinary.com/demo/image/upload/fig1.png',
        '/papers/figures/abc/1/1',
      ]),
    ).toEqual([
      'https://res.cloudinary.com/demo/image/upload/fig1.png',
      '/papers/figures/abc/1/1',
    ]);
  });

  it('dedupes, rejects local paths, and caps at eight figures', () => {
    const urls = Array.from(
      { length: 12 },
      (_, i) => `https://cdn.example/${i}.png`,
    );
    urls.push('https://cdn.example/0.png', 'C:\\temp\\fig.png', '  ');
    expect(uniqueFigureUrls(urls)).toHaveLength(8);
    expect(uniqueFigureUrls(['a', 'a'])).toEqual([]);
  });
});
