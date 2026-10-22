import {
  classifyQueryIntent,
  clarifyIntentReply,
  fallbackCapabilitiesFromBank,
  paperBrowseReply,
  quietGreeting,
  NOT_IN_PAPERS,
  OUTSIDE_SCOPE,
} from './query-intent';

describe('classifyQueryIntent', () => {
  it('treats casual greetings as greeting', () => {
    expect(classifyQueryIntent('hey')).toBe('greeting');
    expect(classifyQueryIntent('Hi!')).toBe('greeting');
    expect(classifyQueryIntent('HELLO!!!')).toBe('greeting');
    expect(classifyQueryIntent('good morning')).toBe('greeting');
    expect(classifyQueryIntent('how are you')).toBe('greeting');
    expect(classifyQueryIntent('how are u')).toBe('greeting');
    expect(classifyQueryIntent('how r u?')).toBe('greeting');
    expect(classifyQueryIntent("how're you")).toBe('greeting');
    expect(classifyQueryIntent("how's it going")).toBe('greeting');
  });

  it('does not treat educational how-questions as greetings', () => {
    expect(classifyQueryIntent('how does inertia work?')).toBe('academic');
    expect(classifyQueryIntent('how do I calculate acceleration?')).toBe(
      'academic',
    );
  });

  it('treats help / what-can-you-do as capabilities', () => {
    expect(classifyQueryIntent('help')).toBe('capabilities');
    expect(classifyQueryIntent('what can you do')).toBe('capabilities');
  });

  it('clarifies bare subjects instead of searching papers', () => {
    expect(classifyQueryIntent('maths')).toBe('clarify');
    expect(classifyQueryIntent('Mathematics')).toBe('clarify');
    expect(classifyQueryIntent('physics')).toBe('clarify');
    expect(classifyQueryIntent('help with chemistry')).toBe('clarify');
    expect(classifyQueryIntent('homework')).toBe('clarify');
  });

  it('treats exam-style questions as academic', () => {
    expect(classifyQueryIntent('what is inertia')).toBe('academic');
    expect(classifyQueryIntent("State Newton's second law")).toBe('academic');
    expect(classifyQueryIntent('define inertia')).toBe('academic');
  });

  it('clarifies whole-paper and year-browse asks instead of searching', () => {
    expect(classifyQueryIntent('give me the question paper of physics')).toBe(
      'clarify',
    );
    expect(classifyQueryIntent('question paper of physics')).toBe('clarify');
    expect(classifyQueryIntent('show me the physics exam paper')).toBe(
      'clarify',
    );
    expect(classifyQueryIntent('Find the Physics paper for 2024')).toBe(
      'clarify',
    );
    expect(classifyQueryIntent('2 year')).toBe('clarify');
    expect(classifyQueryIntent('2024')).toBe('clarify');
  });
});

describe('paperBrowseReply', () => {
  it('names the subject and asks for a topic without claiming a PDF download', () => {
    const text = paperBrowseReply('give me the question paper of physics', [
      'Physics',
      'Mathematics',
    ]);
    expect(text).toMatch(/Physics/i);
    expect(text).toMatch(/topic|formula|question/i);
    expect(text).toMatch(/Available subjects/i);
    expect(text).not.toMatch(/couldn't find relevant study material/i);
    expect(text).not.toMatch(/uploaded paper/i);
  });
});

describe('clarifyIntentReply', () => {
  it('asks what they need for a bare subject without saying uploaded paper', () => {
    const text = clarifyIntentReply('maths', ['Mathematics', 'Physics']);
    expect(text).toMatch(/Mathematics/i);
    expect(text).toMatch(/What would you like to focus on/i);
    expect(text).toMatch(/Available subjects/i);
    expect(text).not.toMatch(/uploaded paper/i);
    expect(text).not.toMatch(/HSC|Section II|Answer Booklet/i);
  });

  it('recognises common subject typos like physcis', () => {
    const text = clarifyIntentReply('physcis', ['Physics', 'Mathematics']);
    expect(text).toMatch(/Happy to help with Physics/i);
    expect(text).toMatch(/What would you like to focus on/i);
  });
});

describe('quietGreeting', () => {
  it('does not name subjects, dump stems, or say exam archive', () => {
    const text = quietGreeting();
    expect(text).toMatch(/Hi!/i);
    expect(text).toMatch(/What would you like to work on/i);
    expect(text).not.toMatch(/Physics|Chemistry|Mathematics/i);
    expect(text).not.toMatch(/exam archive/i);
    expect(text).not.toMatch(/•/);
  });
});

describe('fallbackCapabilitiesFromBank', () => {
  it('names admin subjects and short topics', () => {
    const text = fallbackCapabilitiesFromBank(
      ['Physics', 'Chemistry'],
      [
        {
          questionText: 'Define inertia as resistance to change of motion.',
          subject: 'Physics',
        },
      ],
    );
    expect(text).toContain('Physics');
    expect(text).toContain('Chemistry');
    expect(text).not.toMatch(/Class\s*12|Class\s*XII/i);
  });

  it('works with an empty bank', () => {
    const text = fallbackCapabilitiesFromBank([], []);
    expect(text).toMatch(/exam archive/i);
    expect(text).not.toMatch(/uploaded|admin/i);
  });
});

describe('NOT_IN_PAPERS', () => {
  it('avoids the old harsh out-of-scope sentence', () => {
    expect(NOT_IN_PAPERS).not.toMatch(/do not contain any information/i);
  });
});

describe('OUTSIDE_SCOPE', () => {
  it('redirects to study topics without inventing a citation', () => {
    expect(OUTSIDE_SCOPE).toMatch(/studies|exam archive/i);
    expect(OUTSIDE_SCOPE).not.toMatch(/page \d+/i);
  });
});
