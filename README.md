<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

**EduSearch AI Backend** — A NestJS platform for AI-powered question extraction, classification, search, and exam paper ingestion.

---

## PDF & OCR Question Extraction Pipeline

The backend includes a high-performance, deterministic dual-track extraction pipeline located in `src/papers/`:

### Key Capabilities

1. **Vector Diagram & Figure Extraction (`pdf-figures.ts`)**:
   - STEM exam papers (Mathematics, Physics, Chemistry) draw diagrams, network graphs, geometry shapes, and function plots using **PDF vector paths (`OPS.constructPath`)** rather than raster bitmaps.
   - Detects vector drawing operator bounds, filters page borders and margin barcodes, clusters adjacent strokes, and raster-crops high-resolution figures using `@napi-rs/canvas`.
   - Figures are hosted on Cloudinary or served locally and attached directly to corresponding questions.

2. **Intelligent Tesseract.js OCR Fallback (`pdf-ocr.ts`, `pdf-text.ts`)**:
   - **Primary Path**: High-speed digital text extraction via `unpdf` / `pdf.js` (~5ms per page) with 100% character fidelity.
   - **Fallback Path**: If an uploaded PDF is a physical scan, photocopy, or image-only document (page character count < 40), the pipeline automatically renders high-DPI page buffers and executes **Tesseract.js** (`recognize`) to extract text and layout coordinates.

3. **Smart Question Splitting & Boilerplate Filtering (`question-splitter.ts`)**:
   - Accommodates mixed-format exam papers that use bare numbers in Section I (`1 Consider the network diagram...`) and labeled questions in Section II (`Question 16`).
   - Automatically cleans margin barcodes, scanner serial codes, `Office Use Only`, and `Do NOT write in this area` to prevent false draft cards.

4. **Formula Recognition & Marks Extraction (`formula-extractor.ts`, `marks-extractor.ts`)**:
   - Converts mathematical expressions into standard LaTeX for KaTeX/MathLive rendering in the frontend.
   - Extracts explicit mark allocations (`[2 marks]`, `(3 marks)`).

5. **AI Question Classification (`question-classification.service.ts`)**:
   - Automatically tags question drafts with `subject`, `topic`, `subtopic`, `difficulty` (Easy/Medium/Hard), and `questionType` with a confidence score.

6. **Documentation**:
   - Detailed pipeline guide: [`docs/ADMIN_EXTRACTION_GUIDE.md`](./docs/ADMIN_EXTRACTION_GUIDE.md)
   - Frontend integration reference: [`docs/EXTRACTION_FRONTEND_GUIDE.md`](./docs/EXTRACTION_FRONTEND_GUIDE.md)

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
