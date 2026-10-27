import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const questions = [
  // --- MATHEMATICS ---
  {
    subject: 'Mathematics',
    topic: 'Differential Equations',
    subtopic: 'Second Order Linear Equations',
    examYear: 2025,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Find the general solution to the second-order differential equation d^2y/dx^2 + 4dy/dx + 5y = e^(-2x) * cos(x) subject to initial conditions y(0) = 1, y\'(0) = 0.'
  },
  {
    subject: 'Mathematics',
    topic: 'Calculus',
    subtopic: 'Integration by Parts',
    examYear: 2025,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Evaluate the definite integral of x * e^(2x) dx from x = 0 to x = 1 using integration by parts.'
  },
  {
    subject: 'Mathematics',
    topic: 'Linear Algebra',
    subtopic: 'Eigenvalues and Eigenvectors',
    examYear: 2024,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Determine the eigenvalues and corresponding eigenspaces of the 3x3 symmetric matrix A = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]]. Verify orthogonality.'
  },
  {
    subject: 'Mathematics',
    topic: 'Probability & Statistics',
    subtopic: 'Normal Distribution',
    examYear: 2024,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'A continuous random variable X follows a normal distribution with mean 50 and standard deviation 5. Find P(42 < X < 58) using standard normal z-scores.'
  },
  {
    subject: 'Mathematics',
    topic: 'Multivariable Calculus',
    subtopic: 'Lagrange Multipliers',
    examYear: 2023,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Use the method of Lagrange multipliers to find the maximum and minimum values of f(x, y, z) = x + 2y + 3z subject to the constraint x^2 + y^2 + z^2 = 14.'
  },
  {
    subject: 'Mathematics',
    topic: 'Coordinate Geometry',
    subtopic: 'Conic Sections',
    examYear: 2023,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Find the equation of the tangent and normal to the parabola y^2 = 12x at the point (3, 6).'
  },
  {
    subject: 'Mathematics',
    topic: 'Complex Numbers',
    subtopic: 'Residue Theorem',
    examYear: 2022,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Use the Cauchy Residue Theorem to evaluate the contour integral of (z^2 + 1)/(z^4 + 1) around the circle |z| = 2 oriented counterclockwise.'
  },
  {
    subject: 'Mathematics',
    topic: 'Sequences & Series',
    subtopic: 'Power Series Convergence',
    examYear: 2022,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Determine the radius and interval of convergence of the power series sum from n=1 to infinity of (-1)^n * (x - 2)^n / (n * 3^n).'
  },

  // --- PHYSICS ---
  {
    subject: 'Physics',
    topic: 'Quantum Mechanics',
    subtopic: 'Wave Functions & Uncertainty',
    examYear: 2025,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'A particle of mass m is confined to an infinite square well of width L. Calculate the expectation values of position <x> and momentum <p> for the first excited state (n=2).'
  },
  {
    subject: 'Physics',
    topic: 'Modern Physics',
    subtopic: 'Photoelectric Effect',
    examYear: 2025,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Light of wavelength 300 nm falls on a metal surface with work function 2.3 eV. Calculate the maximum kinetic energy of emitted photoelectrons and the stopping potential.'
  },
  {
    subject: 'Physics',
    topic: 'Electromagnetism',
    subtopic: 'Maxwell Equations & EM Waves',
    examYear: 2024,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Derive the electromagnetic wave equation for the electric field in free space starting from Maxwell\'s curl equations. Express the wave propagation speed in terms of epsilon_0 and mu_0.'
  },
  {
    subject: 'Physics',
    topic: 'Electromagnetic Induction',
    subtopic: 'Faraday\'s Law',
    examYear: 2024,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'A circular coil of 200 turns and radius 5 cm is placed in a uniform magnetic field that changes linearly from 0.2 T to 0.8 T in 0.5 seconds. Calculate the induced electromotive force (EMF).'
  },
  {
    subject: 'Physics',
    topic: 'Thermodynamics',
    subtopic: 'Carnot Cycle & Entropy',
    examYear: 2023,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'A heat engine operates between reservoirs at temperatures T_H = 600 K and T_C = 300 K. Calculate its maximum thermal efficiency and the total change in entropy per cycle during irreversible operation.'
  },
  {
    subject: 'Physics',
    topic: 'Thermal Physics',
    subtopic: 'Ideal Gas Law',
    examYear: 2023,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'An ideal diatomic gas at pressure 1.0 atm and temperature 300 K undergoes adiabatic expansion until its volume doubles. Determine its final temperature and pressure (gamma = 1.4).'
  },
  {
    subject: 'Physics',
    topic: 'Rotational Mechanics',
    subtopic: 'Moment of Inertia',
    examYear: 2022,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'A solid cylinder of mass M and radius R rolls without slipping down an inclined plane of angle theta. Find its linear acceleration and the minimum coefficient of static friction required.'
  },
  {
    subject: 'Physics',
    topic: 'Oscillations',
    subtopic: 'Simple Harmonic Motion',
    examYear: 2022,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'A mass-spring system oscillates with amplitude 0.1 m and angular frequency 10 rad/s. Find the position where kinetic energy equals potential energy.'
  },

  // --- CHEMISTRY ---
  {
    subject: 'Chemistry',
    topic: 'Organic Chemistry',
    subtopic: 'Reaction Mechanisms (SN1 vs SN2)',
    examYear: 2025,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Compare and contrast SN1 and SN2 nucleophilic substitution mechanisms for alkyl halides, discussing stereochemical inversion versus racemization, substrate steric hindrance, and solvent effects.'
  },
  {
    subject: 'Chemistry',
    topic: 'Carbonyl Compounds',
    subtopic: 'Aldol Condensation',
    examYear: 2025,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Outline the mechanism for the base-catalyzed aldol condensation of acetaldehyde to form crotonaldehyde, indicating enolate formation and dehydration steps.'
  },
  {
    subject: 'Chemistry',
    topic: 'Coordination Chemistry',
    subtopic: 'Crystal Field Theory',
    examYear: 2024,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Explain the splitting of d-orbitals in octahedral and tetrahedral crystal fields. Predict magnetic behavior and calculate Crystal Field Stabilization Energy (CFSE) for high-spin and low-spin [Fe(H2O)6]2+ and [Fe(CN)6]4-.'
  },
  {
    subject: 'Chemistry',
    topic: 'Inorganic Chemistry',
    subtopic: 'Transition Metals',
    examYear: 2024,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Account for why first-row transition metal compounds often exhibit variable oxidation states and colorful aqueous solutions, referring to d-d electronic transitions.'
  },
  {
    subject: 'Chemistry',
    topic: 'Physical Chemistry',
    subtopic: 'Chemical Thermodynamics',
    examYear: 2023,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Given standard enthalpies of formation and absolute entropies at 298 K, calculate Delta H, Delta S, and Delta G for the synthesis of ammonia (N2 + 3H2 -> 2NH3). Determine the temperature where the reaction becomes spontaneous.'
  },
  {
    subject: 'Chemistry',
    topic: 'Chemical Kinetics',
    subtopic: 'Rate Laws & Activation Energy',
    examYear: 2023,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'For a first-order chemical reaction, the rate constant doubles when the temperature increases from 300 K to 310 K. Calculate the activation energy Ea using the Arrhenius equation.'
  },
  {
    subject: 'Chemistry',
    topic: 'Electrochemistry',
    subtopic: 'Nernst Equation',
    examYear: 2022,
    difficulty: 'HARD',
    questionType: 'LONG',
    questionText: 'Construct a galvanic cell comprising Zn/Zn2+ and Cu/Cu2+ half-cells. Write the cell notation and use the Nernst equation to compute the cell potential at 298 K when [Zn2+] = 0.01 M and [Cu2+] = 1.0 M.'
  },
  {
    subject: 'Chemistry',
    topic: 'Equilibrium & Solutions',
    subtopic: 'Buffer Systems',
    examYear: 2022,
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    questionText: 'Calculate the pH of a buffer solution prepared by mixing 50 mL of 0.2 M acetic acid (Ka = 1.8e-5) with 50 mL of 0.1 M sodium acetate.'
  }
];

async function seed() {
  console.log('Fetching embeddings from OpenAI for ' + questions.length + ' questions...');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: questions.map(q => q.questionText)
    })
  });

  const body = await res.json();
  if (!body.data) {
    throw new Error('OpenAI embedding error: ' + JSON.stringify(body));
  }

  const embeddings = body.data.map(item => item.embedding);
  console.log('Received ' + embeddings.length + ' embeddings from OpenAI.');

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to Neon PostgreSQL.');

  try {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const embStr = '[' + embeddings[i].join(',') + ']';
      await client.query(
        'INSERT INTO questions (id, question_text, subject, topic, subtopic, exam_year, exam_type, difficulty, question_type, source_document, page_reference, embedding_status, embedding_model, embedding, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::vector, NOW(), NOW())',
        [
          randomUUID(),
          q.questionText,
          q.subject,
          q.topic,
          q.subtopic,
          q.examYear,
          'National Board Exam',
          q.difficulty,
          q.questionType,
          'Curated Exam Bank',
          'Section A',
          'READY',
          'text-embedding-3-small',
          embStr
        ]
      );
    }
    console.log('Successfully inserted ' + questions.length + ' questions!');
  } finally {
    await client.end();
  }
}

seed().catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
});
