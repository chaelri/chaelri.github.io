/* Karla — Medical Virtual Assistant interview prep
   All content is grounded in verified facts from her documents and her own answers.
   Nothing here claims experience she does not have. */

export const PROFILE = {
  name: 'Karla Sofia A. Romantico, RMT',
  role: 'Registered Medical Technologist',
  target: 'Medical Virtual Assistant — Global Medical Virtual Assistants',
  posting: 'https://apply.workable.com/gmva/j/AE9B4B2960/',
  cv: './Karla-Sofia-Romantico-RMT-CV.pdf',
  facts: [
    { icon: 'groups',            k: '7',    v: 'medtechs she leads as OIC' },
    { icon: 'personal_injury',   k: '120',  v: 'patients a day' },
    { icon: 'timer',             k: '1 hr', v: 'STAT turnaround met' },
    { icon: 'verified_user',     k: 'HIPAA',v: 'certified, Aug 2026' },
  ],
};

/* ---------------------------------------------------------------- intro -- */

export const INTRO = {
  seconds: 90,
  lines: [
    "Thank you for having me. I'm Karla Romantico, a licensed Medical Technologist. I've been with Aventus Medical Care at their Eastwood multi-specialty clinic for almost three years — it's part of Fullerton Health.",
    "Our lab serves about 120 patients a day, and I rotate through every section — phlebotomy, hematology, chemistry, clinical microscopy, serology, and drug testing. So I work as a generalist rather than a specialist. I'm also frequently assigned as Officer-in-Charge of our seven technologists, which means delegating section coverage and being the escalation point when result or workflow issues come up.",
    "A large part of my day is communication, not just bench work. I encode and verify results in our laboratory information system, and I also validate what other technologists have encoded before anything is released — so accuracy under time pressure is something I'm accountable for every day. We hold strict turnaround times: one hour for STAT, two hours for CBC and urinalysis. I take inbound calls from physicians and nursing staff about results and specimen requirements, and I explain pre-test preparation directly to patients.",
    "I'm HIPAA-certified, and through Fullerton Health I've completed corporate training in data privacy, information security, and governance — so handling protected health information inside a compliance framework is already normal to me.",
    "I want to move into a Medical Virtual Assistant role because the parts of my work I enjoy most are the patient and provider communication and the accuracy of the record. I'd like to do that full-time and remotely, and I'm ready for night shift.",
  ],
  coaching: [
    'Slow down. Ninety seconds feels long — it is not. Rushing is the single most common mistake.',
    'Land these four numbers: three years, 120 patients, seven technologists, one-hour STAT. They do the persuading for you.',
    'Say "Officer-in-Charge" out loud. It is the phrase that separates you from every other applicant with an RMT licence.',
    'End on night shift. Leave them with the answer to the question they were about to ask.',
  ],
};

/* ------------------------------------------------------------ positioning -- */

export const POSITIONING = [
  {
    req: 'Managing inbound and outbound calls with patients and providers',
    truth: 'She fields inbound calls from physicians and nursing staff daily — results, test availability, specimen requirements.',
    say: '"Our lab line is answered by whoever is on duty, and often that\'s me. Doctors and nurses call asking whether a result is out, what sample a test needs, or to follow up on something urgent. I handle that in the middle of bench work, so switching between the phone and the task is normal for me."',
  },
  {
    req: 'Obtaining medical history through EMR systems',
    truth: 'She uses a clinic LIS (STARLIS barcoding, Diagnostic Result System) — not a US EMR.',
    say: '"I work in our laboratory information system every day — barcoding through STARLIS, encoding and releasing through our Diagnostic Result System. I haven\'t used Cerner or Epic, but I know what it is to live inside a clinical system where a wrong entry has consequences, and I pick up software quickly."',
  },
  {
    req: 'Verifying healthcare insurance coverage and eligibility',
    truth: 'Not hers — billing and admin own LOAs at Aventus. Do not claim it.',
    say: '"That sits with our billing and admin team, so I haven\'t done eligibility verification myself. What I do have is the discipline it needs — checking a record field by field against a source document before it goes anywhere. That\'s exactly what I do when I validate another technologist\'s encoding."',
  },
  {
    req: 'Data entry, record management, email, timekeeping',
    truth: 'Encodes and releases results, validates other techs\' entries, keeps critical-value logs and Excel records, stock custodian.',
    say: '"I encode results, and I also verify what my colleagues have encoded before release — so I\'m the last check. On top of that I keep our critical-value log and our reagent inventory records. Documentation is not a side task in a laboratory, it is the job."',
  },
  {
    req: 'Health promotion, patient intake, explaining preparation',
    truth: 'She instructs patients directly on fasting, collection technique, repeat samples.',
    say: '"I explain preparation to patients face to face every day — fasting, how to collect a urine or stool sample properly, why we need a repeat draw. A lot of that is reassurance, especially with elderly patients or someone nervous about a needle."',
  },
  {
    req: 'Acting as liaison between patients and providers',
    truth: 'Critical values escalate through Head MT → Clinical Pathologist → Clinic Head, all logged; ~3 per week.',
    say: '"When we get a critical value — roughly three times a week — I\'m the one who identifies it and starts the escalation. It goes to our Head Medical Technologist, then the Clinical Pathologist, then the Clinic Head, and every instance is logged. I don\'t call the patient myself, that\'s the Clinic Head\'s role, but I know what it means to move urgent clinical information through a chain correctly and on time."',
  },
  {
    req: 'Strict HIPAA compliance',
    truth: 'HIPAA certified Aug 2026, plus Fullerton Health data privacy, information security, and governance training.',
    say: '"I took my HIPAA certification this August. And at Fullerton Health we complete annual compliance training — data privacy, information security, governance. Handling patient information under rules isn\'t new to me; only the name of the regulation is."',
  },
  {
    req: 'Attention to detail, highly organized, impartial',
    truth: 'Validates others\' work, daily QC and calibration, 1-hour STAT deadlines, stock custodian.',
    say: '"Every morning before we open I run quality control and calibration. During the day I hold to one-hour STAT turnaround. And I sign off on other technologists\' encoding. If I am careless, a doctor makes a decision on a wrong number — that\'s the standard I already work to."',
  },
];

/* ------------------------------------------------------------------- Q&A -- */

export const QA = [
  /* ---- Opening ---- */
  {
    cat: 'Opening', q: 'Tell me about yourself.',
    a: ['Use the 90-second script in the section above, almost word for word. Do not improvise this one — it is the only answer you can fully control.'],
    ref: 'intro',
  },
  {
    cat: 'Opening', q: 'Why do you want to be a Medical Virtual Assistant?',
    a: [
      '"The parts of my job I like most are the ones that aren\'t the bench — talking a patient through their prep, answering a doctor who needs a result now, making sure the record is right. In a laboratory those are the edges of the role. In this role they are the whole role."',
      '"I also want work I can do for the long term from home. I\'m licensed, I know medical terminology, and I already work inside a compliance framework. This is the same knowledge applied to a different seat."',
    ],
  },
  {
    cat: 'Opening', q: 'Why are you leaving your current job?',
    a: [
      'Never criticise Aventus. Frame it as direction, not escape.',
      '"I\'m not unhappy there — I\'ve grown a lot, I get trusted as Officer-in-Charge, and I\'d leave on good terms with a full 30 days. But I\'ve gone about as far as I can in a clinic laboratory without moving into a purely technical track, and the direction I actually want is patient and provider support. This role is that, and it lets me work from home permanently."',
    ],
  },
  {
    cat: 'Opening', q: 'What do you know about our company?',
    a: [
      '"Global Medical Virtual Assistants places Filipino healthcare professionals with US providers — so the value is that you\'re sending people who already understand clinical work, not general VAs who have to learn it. From the posting, the role covers calls with patients and providers, EMR navigation, insurance verification, scheduling and records, all under HIPAA. It\'s permanent work-from-home on night shift, as an independent contractor."',
      'Read the posting once more the morning of the interview. Being able to quote the actual tasks back is worth more than any research.',
    ],
  },
  {
    cat: 'Opening', q: 'Where do you see yourself in three to five years?',
    a: [
      '"Still in healthcare support, but deeper. Realistically in the first year I want to be genuinely fluent in whichever EMR the client uses and be someone the provider trusts with their harder cases. Beyond that I\'d like to grow into a senior or lead role — I already do that here as Officer-in-Charge, and I enjoy training people."',
    ],
  },

  /* ---- Experience ---- */
  {
    cat: 'Your experience', q: 'Walk me through a typical day.',
    a: [
      '"I start before the clinic opens with quality control and calibration on our analyzers — hematology, chemistry, electrolytes. Once we open, patients come through for extraction, so I\'m drawing blood and explaining preparation. Then it\'s specimen processing and running the tests, encoding results into our system, and verifying them before release."',
      '"Through all of that the phone goes — doctors, nurses, patients asking when results will be out. If I\'m Officer-in-Charge that day I\'m also assigning who covers which section, and anything unusual comes to me first. We serve about 120 patients, so it\'s constant."',
    ],
  },
  {
    cat: 'Your experience', q: 'What is your experience with medical terminology?',
    a: [
      '"It\'s the language I work in. I read test requests, I know what each test is for and what an abnormal result implies, and I talk to physicians about them. Chemistry, hematology, serology, microscopy, microbiology — I rotate through all of it, so I\'m not narrow to one vocabulary."',
      'If they test you, they will likely ask what a CBC, BUN, creatinine, or A1c is. Answer plainly and briefly.',
    ],
  },
  {
    cat: 'Your experience', q: 'What is a critical value, and what do you do when you get one?',
    a: [
      'This is your strongest technical answer. Be precise.',
      '"A critical value is a result so far outside the normal range that it could be life-threatening if nobody acts on it — it needs to reach a clinician immediately, not at the end of the shift. We see them roughly three times a week."',
      '"When I get one I verify it first — I check the sample, and repeat it if there\'s any doubt, because acting on a bad result is worse than a short delay. Then I escalate: our Head Medical Technologist, then the Clinical Pathologist, and the Clinic Head, who informs the patient. Every one goes into our critical-value log with the time. The logging matters as much as the call — it\'s the proof the information actually moved."',
    ],
  },
  {
    cat: 'Your experience', q: 'How do you make sure your data entry is accurate?',
    a: [
      '"I check the entry against the request form before I release anything, and if a value looks clinically improbable I go back to the sample rather than trust the screen. I also verify results that other technologists have encoded, so I\'m the second pair of eyes on their work as well as the first on mine."',
      '"Honestly the habit is: slow at the point of entry is faster than fast plus a correction later."',
    ],
  },
  {
    cat: 'Your experience', q: 'Tell me about a time you caught an error.',
    a: [
      'Pick a real one before the interview. The shape that works:',
      '"When I verify a colleague\'s encoding I compare it back to the request. I\'ve caught results entered against the wrong patient because two request forms were adjacent in the batch. I corrected it before release, told the technologist directly so they knew what happened, and flagged it so we were more careful with batching. Nobody was blamed — but if it had gone out, a doctor would have been reading someone else\'s blood."',
    ],
  },
  {
    cat: 'Your experience', q: 'You are Officer-in-Charge — what does that actually involve?',
    a: [
      'Be accurate: it is an assigned duty, not a contractual title. Say so, it reads as honest.',
      '"It isn\'t a separate position in my contract — it\'s a duty I get assigned regularly, and it covers seven technologists. I decide who covers which section that shift, I\'m the person people come to when a result doesn\'t look right or a machine is down, and I make the call on whether we escalate. I also train new staff and interns."',
    ],
  },

  /* ---- The hard ones ---- */
  {
    cat: 'The hard ones', gap: true,
    q: 'You have never used Cerner, Epic, AthenaHealth, or NextGen. Why should we hire you?',
    a: [
      'Do not bluff. Concede fast, then pivot to what transfers.',
      '"That\'s right, I haven\'t used those. I use a laboratory information system daily — barcoding, encoding, verifying, releasing — so what I bring isn\'t the specific software, it\'s knowing what the fields mean. A patient identifier, an order, a result, a release step: I understand why each one matters clinically."',
      '"Software I can learn in weeks. Knowing that a potassium of 7 needs someone woken up took me a degree and a licence. I\'d rather be the person who has the second one already."',
    ],
  },
  {
    cat: 'The hard ones', gap: true,
    q: 'You have no insurance verification experience.',
    a: [
      '"None — at our clinic that sits with billing and admin, so I\'d be learning it from the beginning. I won\'t pretend otherwise."',
      '"What I\'d bring to it is the verification habit itself. Checking a record field by field against a source before it goes anywhere is exactly what I do when I validate another technologist\'s encoding, and I do that every day. The subject matter is new; the carefulness isn\'t."',
    ],
  },
  {
    cat: 'The hard ones', gap: true,
    q: 'You have never worked a night shift. How do you know you can?',
    a: [
      'Do not overclaim. You have long-shift stamina, not overnight experience.',
      '"I haven\'t worked overnight. My shift is 7 AM to 6 PM, and we used to run an extended shift to 10 PM — so I\'ve done fifteen-hour days on my feet in a clinic, but not a graveyard."',
      '"I\'ve thought about it properly rather than just saying yes. I work from home, so there\'s no commute eating into my sleep, I have a room I can black out, and my household knows the plan. I\'d expect the first two weeks to be an adjustment and I\'m prepared for that. I wouldn\'t have applied to a night-shift role if I weren\'t willing to reorganise my day around it."',
    ],
  },
  {
    cat: 'The hard ones', gap: true,
    q: 'You have no BPO or call centre background. This role is heavy on calls.',
    a: [
      '"Not in a call centre, no. But I take clinical calls every day — a doctor who needs a result now, a nurse asking what container a test needs, a patient asking when they can collect. Those aren\'t scripted calls, and the person on the other end is usually in a hurry."',
      '"What I\'d have to learn is volume and the tooling — how many calls, how they\'re logged, the phrasing you\'re expected to use. That\'s trainable. Being comfortable talking to a physician about a clinical detail is the part that isn\'t, and I already am."',
    ],
  },
  {
    cat: 'The hard ones', gap: true,
    q: 'How is your English? Have you dealt with American callers?',
    a: [
      'Answer in calm, unhurried English. The delivery is the answer.',
      '"I\'m comfortable in English — it\'s the language I studied and work in, and all our documentation is in English. I\'d be honest that I haven\'t taken calls from American patients specifically, so American accents over a phone line will take me a short while to tune into."',
      '"My approach when I don\'t catch something is the same one I use now: I ask them to repeat it, and I read it back to confirm. In a clinical setting guessing is not an option, so I\'d rather ask twice than record something wrong."',
    ],
  },
  {
    cat: 'The hard ones', gap: true,
    q: 'You are a licensed Medical Technologist. Are you not overqualified? Will you leave when a hospital job comes up?',
    a: [
      '"I understand the concern. I\'m not leaving the healthcare field — I\'m choosing a part of it I want to do long-term. I\'ve had almost three years at the bench and I know what that career looks like, and the parts I keep gravitating to are the patient and provider side."',
      '"This is also permanent work from home, which matters to me, and it uses my licence rather than wasting it. I\'d be moving toward something, not away from something."',
    ],
  },

  /* ---- Phone scenarios ---- */
  {
    cat: 'Phone scenarios', q: 'A patient calls, upset that their results are not ready.',
    a: [
      '"First I let them finish, and I don\'t start with an excuse. Something like — I understand, let me check exactly where it is for you."',
      '"Then I give them something concrete: where it is in the process and when they can realistically expect it. I do this now. Most of the frustration isn\'t about the delay, it\'s not knowing. If I can\'t fix the timing I can at least remove the uncertainty, and I follow up when I said I would."',
    ],
  },
  {
    cat: 'Phone scenarios', q: 'A patient asks you what their lab result means.',
    a: [
      'A scope-boundary question. Getting this right signals you are safe to put in front of patients.',
      '"I don\'t interpret results for patients — that\'s the provider\'s role, and it\'s the same rule at our clinic, where the Clinic Head is the one who discusses findings."',
      '"But I don\'t just refuse either. I\'d confirm their result is released and with their doctor, explain that the physician will go through what it means in their context, and offer to help them get in front of that provider sooner. Patients accept a boundary far better when you give them the next step with it."',
    ],
  },
  {
    cat: 'Phone scenarios', q: "Someone calls saying they are from a doctor's office and asks for a patient's records.",
    a: [
      'This is a HIPAA test disguised as a phone question.',
      '"I wouldn\'t release anything on the strength of the caller saying who they are. I\'d verify the request against our process first — confirm the requesting practice through a number we hold, not one they give me, and check there\'s authorisation on file."',
      '"And I\'d only release what was actually asked for, not the whole chart. If I couldn\'t verify it, I\'d escalate rather than guess. Nobody has ever been disciplined for taking an extra five minutes to confirm."',
    ],
  },
  {
    cat: 'Phone scenarios', q: 'You cannot understand what a caller is saying.',
    a: [
      '"I ask, politely and without apologising five times. \'Sorry, could you repeat that for me?\' — and then I read it back: \'So that\'s Maria, date of birth March 4th, is that right?\'"',
      '"Reading back is a habit from the laboratory. We do it with verbal orders because a misheard number is a wrong test. I\'d rather ask twice than enter something wrong once."',
    ],
  },
  {
    cat: 'Phone scenarios', q: 'A caller becomes rude or shouts at you.',
    a: [
      '"I stay level and I don\'t take it personally — usually someone shouting is worried, not angry at me. I let them say the whole thing, acknowledge it, then move to what I can actually do."',
      '"We get this in the clinic with patients who\'ve been waiting or who\'ve had bad news. If someone crosses into abuse, that\'s when I\'d follow whatever escalation process you have rather than handle it alone."',
    ],
  },
  {
    cat: 'Phone scenarios', q: 'You have to make an outbound call to a provider to verify information.',
    a: [
      '"I\'d prepare before dialling — patient identifiers, exactly what I need, and where I\'m going to record the answer. Then identify myself and the practice, state the reason in one sentence, get the information, read it back, and document it with the date, time and who I spoke to."',
      '"Provider staff are busy. Being organised on the call is a courtesy and it\'s also how you get a straight answer."',
    ],
  },

  /* ---- HIPAA ---- */
  {
    cat: 'HIPAA & privacy', q: 'What is HIPAA, in your own words?',
    a: [
      '"It\'s the US law that protects patients\' health information — it sets rules about who may see it, how it must be kept, and what has to happen if it\'s exposed. The core idea I work by is minimum necessary: you access only what you need to do the task in front of you, and nothing more out of curiosity."',
      '"I took my certification this August. And the principle isn\'t foreign to me — we work under the Data Privacy Act here, and Fullerton Health runs us through data privacy and information security training every year."',
    ],
  },
  {
    cat: 'HIPAA & privacy', q: 'What counts as protected health information?',
    a: [
      '"Anything that identifies a patient and relates to their health or their care or payment for it. So not just the diagnosis or lab result — the name, birth date, address, phone number, medical record number, insurance details. Even a chart with the name removed can still identify someone if enough other details are attached."',
    ],
  },
  {
    cat: 'HIPAA & privacy', q: 'You realise you emailed patient information to the wrong person. What do you do?',
    a: [
      'The only wrong answer is hiding it. Say that explicitly.',
      '"I report it immediately — to my supervisor or the privacy officer, the moment I notice. I don\'t try to quietly fix it and I don\'t wait to see whether anyone noticed."',
      '"Then I document exactly what went out, to whom and when, and follow whatever the breach process requires — recall the message if that\'s possible, ask the recipient to delete it. A mistake reported in five minutes is an incident. The same mistake concealed is a violation."',
    ],
  },
  {
    cat: 'HIPAA & privacy', q: 'You work from home. How do you keep patient information secure there?',
    a: [
      '"I work in a room by myself with the door closed, and I use a headset so nothing is on speaker. My screen doesn\'t face a doorway, and I lock it whenever I step away, even for a minute."',
      '"Nothing patient-related is printed, saved to my own device, or discussed with my family — not even in general terms. And I keep the machine itself locked down: password, updates applied, no shared accounts."',
    ],
  },
  {
    cat: 'HIPAA & privacy', q: 'A family member walks in while you are on a call with a patient.',
    a: [
      '"They know not to, because I set that expectation before I start work — closed door means working. If it happened, I\'d stop discussing the patient until they left, and if the caller had heard anything I\'d note it. I use a headset for exactly this reason, so my side is the only side audible in the room."',
    ],
  },

  /* ---- Work from home ---- */
  {
    cat: 'Work from home', q: 'Describe your equipment and internet.',
    a: [
      'Rehearse this until it is automatic. They will check it against your application form.',
      '"My primary machine is a MacBook Pro with the M5 chip. My backup is a desktop PC — Ryzen 5 2600, 16 GB of RAM, Windows 11 64-bit. Internet is PLDT Fibre at 300 Mbps contracted, with mobile data as backup. I have a USB noise-cancelling headset and an HD webcam, and a dedicated quiet workspace."',
    ],
  },
  {
    cat: 'Work from home', q: 'Your internet goes down mid-shift. What happens?',
    a: [
      '"I notify my supervisor or the team channel immediately through whatever still works — mobile data on my phone if the fibre is out — so nobody is waiting on me silently."',
      '"Then I switch to my mobile backup connection and keep working. If it\'s going to be a long outage I say so early rather than let people discover it. The failure isn\'t the problem; going quiet is."',
    ],
  },
  {
    cat: 'Work from home', q: 'How do you stay productive without a supervisor in the room?',
    a: [
      '"Honestly, a laboratory already runs that way — nobody stands over you while you calibrate an analyzer, and the turnaround clock does the supervising. I\'m used to being measured on whether the work is right and on time."',
      '"Practically, I keep the same start time every shift, I work from a list, and I over-communicate rather than under-communicate. If something is going to be late, I say so before it\'s late."',
    ],
  },
  {
    cat: 'Work from home', q: 'You understand this is an independent contractor arrangement?',
    a: [
      '"Yes — independent contractor, starting at $800 a month, with paid time off and HMO coverage as stated in the posting. I understand that means I handle my own taxes and contributions here. That\'s clear to me and I\'m fine with it."',
    ],
  },
  {
    cat: 'Work from home', q: 'What are your salary expectations?',
    a: [
      'The rate is published. Do not negotiate at screening — it reads as not having read the posting.',
      '"The posting states $800 a month to start, and that works for me. I\'d rather focus on getting good at the role — I saw there\'s performance-based increase, and I\'d want to earn that."',
    ],
  },
  {
    cat: 'Work from home', q: 'When can you start?',
    a: [
      '"I need to render 30 days\' notice at Aventus — I want to leave properly, and I think how someone exits a job tells you something about them. So 30 days from an offer. I can complete paperwork, training prerequisites, or system access setup during that period if it helps."',
    ],
  },

  /* ---- Behavioral ---- */
  {
    cat: 'Behavioral', q: 'Tell me about a time you handled several urgent things at once.',
    a: [
      '"That\'s most days. The clearest version: a STAT request comes in with a one-hour clock while I\'m mid-run on a batch, there are patients waiting for extraction, and the phone is going."',
      '"I triage by consequence. STAT goes first because a clinician is waiting to make a decision. Extraction next, because a patient physically waiting is a patient whose whole result chain is stalled. The phone I answer but keep short — I tell them when I\'ll call back and then I actually do. What I don\'t do is try to hold all three at once and get all three slightly wrong."',
    ],
  },
  {
    cat: 'Behavioral', q: 'Tell me about a time you disagreed with a supervisor or colleague.',
    a: [
      'Keep it professional and low-drama. A verification disagreement is ideal.',
      '"When I verify results before release I sometimes disagree with what a colleague has encoded, or think a sample should be repeated. I raise it directly with the person first, privately, and I frame it as the result rather than them — this value doesn\'t match the request, can we recheck."',
      '"Most of the time we settle it in a minute. If we can\'t agree and it\'s clinically significant, it goes to our Head Medical Technologist, because the patient matters more than either of us being right."',
    ],
  },
  {
    cat: 'Behavioral', q: 'Tell me about training someone.',
    a: [
      '"As a senior technologist I help train new staff and interns. I don\'t start by handing them a manual — I have them watch one, then do one while I watch, then check their work for a while before they\'re on their own."',
      '"The part I insist on is that they ask. A new person guessing quietly is the most dangerous thing in a laboratory, so I make it very easy to ask me a stupid question."',
    ],
  },
  {
    cat: 'Behavioral', q: 'This role is repetitive. How do you handle that?',
    a: [
      '"Laboratory work is repetitive too — the same tests, the same calibrations, every day. The thing that keeps it from going numb is remembering there\'s a person attached to each one. Sample 47 is somebody waiting on an answer."',
      '"Practically I keep the routine tight so the repetitive parts are automatic, which leaves attention for the things that are actually unusual. That\'s how you catch the outlier."',
    ],
  },
  {
    cat: 'Behavioral', q: 'What is your greatest weakness?',
    a: [
      'Give a real one with a real correction. Avoid "I work too hard."',
      '"I\'m slow to ask for help. My instinct is to finish something myself rather than hand it over, which is fine when I\'m right and costs time when I\'m not. Being Officer-in-Charge has forced me out of it — with seven people I have to delegate, and I\'ve learned that asking early is not the same as not coping."',
    ],
  },
  {
    cat: 'Behavioral', q: 'What is your greatest strength?',
    a: [
      '"Accuracy under a clock. I get 120 patients a day and a one-hour STAT limit, and I\'m also the person who verifies other technologists\' work before release. I\'ve had to make careful and fast coexist rather than trade one for the other."',
    ],
  },

  /* ---- Closing ---- */
  {
    cat: 'Closing', q: 'Do you have any questions for us?',
    a: [
      'Always have three. Not having any reads as not being serious.',
      '"What EMR does the client I\'d be supporting use, and what does the training on it look like?"',
      '"What do the first thirty days look like — is there a nesting or supervised period before I take calls on my own?"',
      '"What are the exact shift hours in Philippine time, and how fixed are they?"',
      '"How do you measure success in this role in the first six months?"',
      'Do not ask about leave, increases, or reducing hours in a first interview.',
    ],
  },
  {
    cat: 'Closing', q: 'Is there anything else we should know about you?',
    a: [
      'Use this to close the loop on the biggest doubt, before they leave the call with it unspoken.',
      '"Only that I know the obvious gap here is that I haven\'t worked in a US EMR or done insurance verification. I\'d rather say that plainly than have you wonder. What I\'m bringing is a licence, three years of clinical work, HIPAA certification, and the habits of somebody who signs off on other people\'s accuracy. The rest I\'ll learn quickly, and I\'ll ask when I don\'t know something."',
    ],
  },
];

/* ------------------------------------------------------------- checklist -- */

export const CHECKLIST = [
  { icon: 'wifi',            t: 'Test the connection', d: 'Run a speed test on the interview machine an hour before. Have the phone hotspot already paired as backup.' },
  { icon: 'headphones',      t: 'Headset, not laptop mic', d: 'Join five minutes early and check the audio. Bad audio loses more interviews than bad answers.' },
  { icon: 'light_mode',      t: 'Light on your face', d: 'Window or lamp in front, not behind. Plain wall behind you, door closed.' },
  { icon: 'description',     t: 'Have these on screen', d: 'The job posting, your CV, and this page — but do not read from them. Glancing is fine, reciting is obvious.' },
  { icon: 'badge',           t: 'Documents within reach', d: 'PRC licence, HIPAA certificate, and the equipment specs, in case they ask you to confirm anything live.' },
  { icon: 'record_voice_over', t: 'Say the intro out loud three times', d: 'Out loud, not in your head. Time it — if you are under 60 seconds you are rushing.' },
  { icon: 'psychology',      t: 'Rehearse the four hard ones', d: 'No EMR experience. No insurance verification. No night shift. No foreign callers. Own each in one sentence, then pivot.' },
  { icon: 'schedule',        t: 'Know your numbers cold', d: '3 years · 120 patients/day · 7 technologists · 1-hour STAT · 3 critical values a week · 30 days notice.' },
];
