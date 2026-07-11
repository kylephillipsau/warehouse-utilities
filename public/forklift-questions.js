/*
 * Forklift Licence Practice Test — question bank.
 *
 * Content is drawn from the Star Training & Assessing "Licence to Operate a
 * Forklift Truck" LF Study Guide (V6.0) and its matching Pre-Assessment
 * Activities booklet, covering the TLILIC0003 high-risk work licence theory:
 * legislation, hazards & controls, communication, pre-start & operational
 * checks, attachments, general operation, stability & load centre, shutdown
 * and load calculations.
 *
 * This is study material only. It is NOT the official assessment and does not
 * replace accredited training with a Registered Training Organisation (RTO).
 * The real assessment is closed-book and worded differently. Always follow
 * your workplace procedures, the manufacturer's instructions and current
 * WHS/OHS legislation. Powerline distances quoted are the Victorian figures
 * used in the study guide; other states may differ.
 *
 * Each question: { category, question, options: [], answer: <index>, explanation }
 */
const FORKLIFT_QUESTIONS = [
  // ---------------------------------------------------------------
  // Legislative Requirements
  // ---------------------------------------------------------------
  {
    category: "Legislative Requirements",
    question: "What is your duty of care as a worker?",
    options: [
      "Take care of your own health and safety, and not affect others by your acts or omissions",
      "Only worry about your own safety, not others",
      "Report to WorkSafe every day",
      "Repair any faulty equipment yourself"
    ],
    answer: 0,
    explanation: "As a worker you must take care of your own health and safety, take care not to affect others by your acts or omissions, cooperate with WHS policies and procedures, and not misuse or interfere with anything in the workplace."
  },
  {
    category: "Legislative Requirements",
    question: "What can WorkSafe do to a High-Risk Work licence holder who fails to work safely?",
    options: [
      "Nothing — a licence is permanent",
      "Suspend or cancel the licence, prosecute, refuse renewal, or order a reassessment",
      "Only issue a verbal warning",
      "Increase the renewal fee"
    ],
    answer: 1,
    explanation: "WorkSafe can suspend your licence, cancel your licence, prosecute you, refuse to renew your licence, or order a reassessment on your licence."
  },
  {
    category: "Legislative Requirements",
    question: "Where could you find documented information about workplace safety?",
    options: [
      "Only by asking a co-worker",
      "OHS/WHS policies, the operator's manual, codes of practice, Australian Standards and safe work procedures",
      "On social media",
      "Only in the forklift's glovebox"
    ],
    answer: 1,
    explanation: "Sources include OHS/WHS policies, the operator's manual, manufacturer's instructions, the OHS/WHS representative, legislation and regulations, Australian Standards, codes of practice, management plans and safe work procedures."
  },
  {
    category: "Legislative Requirements",
    question: "According to WHS/OHS law, what must an employer do to ensure the health and safety of an employee?",
    options: [
      "Only pay wages on time",
      "Provide and maintain a safe workplace, safe equipment and safe systems of work, plus information, training and supervision",
      "Provide a forklift only",
      "Leave safety entirely up to the worker"
    ],
    answer: 1,
    explanation: "An employer must provide and maintain a safe workplace, safe equipment and safe systems of work, provide adequate facilities, provide instruction/information/training/supervision, and ensure the safe use, handling and storage of equipment and substances."
  },
  {
    category: "Legislative Requirements",
    question: "You have just got your forklift licence and are using an unfamiliar forklift. What should your employer do?",
    options: [
      "Nothing — you are now licensed",
      "Provide training, instruction, information and supervision",
      "Let you work it out yourself",
      "Only give you the keys"
    ],
    answer: 1,
    explanation: "Even though you are licensed, the employer should provide training, instruction, information and supervision for a forklift you are not familiar with."
  },

  // ---------------------------------------------------------------
  // Hazards, Risks & Control Measures
  // ---------------------------------------------------------------
  {
    category: "Hazards & Controls",
    question: "Under WHS law, what is a HAZARD?",
    options: [
      "The likelihood that harm will occur",
      "A thing (or situation) that has the potential to cause harm to a person",
      "An injury that has already happened",
      "A type of safety sign"
    ],
    answer: 1,
    explanation: "A hazard is 'a thing (or situation) that has the potential to cause harm to a person'. For example, a forklift or overhead powerlines are hazards."
  },
  {
    category: "Hazards & Controls",
    question: "Under WHS law, what is a RISK?",
    options: [
      "The thing that could cause harm",
      "The possibility or likelihood that the hazard will cause injury or harm",
      "A completed incident report",
      "A type of forklift attachment"
    ],
    answer: 1,
    explanation: "A risk is 'the possibility or likelihood that the hazard will cause injury or harm'."
  },
  {
    category: "Hazards & Controls",
    question: "Who could you talk to about hazards before you start work?",
    options: [
      "Only the forklift manufacturer",
      "Workmates, supervisors, managers, safety representatives and OHS committee members",
      "Nobody — just start work",
      "Only a WorkSafe inspector"
    ],
    answer: 1,
    explanation: "You could talk to workmates, supervisors, managers, safety representatives, workplace engineers, and OHS reps and committee members."
  },
  {
    category: "Hazards & Controls",
    question: "Why should we talk to people about hazards before we start work?",
    options: [
      "To pass the time",
      "To identify workplace hazards and controls and understand the rules and procedures",
      "It is not necessary",
      "Only to satisfy insurance"
    ],
    answer: 1,
    explanation: "Talking to people helps identify workplace hazards and their controls, and ensures you understand and follow the workplace rules and procedures."
  },
  {
    category: "Hazards & Controls",
    question: "Which of the following is a workplace hazard you must plan for when operating a forklift?",
    options: [
      "The colour of the forklift",
      "Overhead powerlines, pedestrians, blind corners, ramps and wet surfaces",
      "The brand of your safety boots",
      "The time you started your shift"
    ],
    answer: 1,
    explanation: "Hazards to plan for include overhead powerlines, underground services, pedestrians, doorways, other equipment, weather, vehicle traffic, blind corners, uneven ground, ramps, wet surfaces, loading docks, overhead obstructions, chemicals and poor lighting."
  },
  {
    category: "Hazards & Controls",
    question: "Other than hazards, what else do you need to plan for to work safely (remember P.L.A.C.E.)?",
    options: [
      "Permits, Location, Attachments/access to load, Capacity/communication, Equipment",
      "Paint, Lights, Air, Colour, Engine",
      "Pallets, Ladders, Axles, Chains, Exhaust",
      "Price, Length, Age, Cost, Extras"
    ],
    answer: 0,
    explanation: "The P.L.A.C.E. planning aid covers Permits, Location, Attachments/access to load, Capacity/communication and Equipment — plus what you're lifting, how you'll lift it, blind spots and your travel path."
  },
  {
    category: "Hazards & Controls",
    question: "In Victoria, what minimum distance must you keep from a POWER POLE line WITHOUT a qualified spotter?",
    options: ["3 metres", "6.4 metres", "8 metres", "10 metres"],
    answer: 1,
    explanation: "For power poles: 3 metres with a qualified spotter, or 6.4 metres without a spotter. For towers: 8 metres with a spotter, or 10 metres without."
  },
  {
    category: "Hazards & Controls",
    question: "In Victoria, what minimum distance must you keep from a TOWER powerline WITHOUT a qualified spotter?",
    options: ["3 metres", "6.4 metres", "8 metres", "10 metres"],
    answer: 3,
    explanation: "For towers: 8 metres with a qualified spotter, or 10 metres without a spotter. (Power poles are 3 m with a spotter, 6.4 m without.)"
  },
  {
    category: "Hazards & Controls",
    question: "How can you find out the voltage of overhead powerlines?",
    options: [
      "Guess from the height",
      "Call the power company",
      "Touch them with the mast",
      "Check the forklift data plate"
    ],
    answer: 1,
    explanation: "Call the power company to find out the voltage of overhead powerlines."
  },
  {
    category: "Hazards & Controls",
    question: "What visual systems can be used to identify overhead powerlines?",
    options: [
      "Tiger tails, warning signs, powerline marker balls and coloured markers",
      "Nothing — they are always obvious",
      "Painted lines on the floor",
      "The forklift's reversing beeper"
    ],
    answer: 0,
    explanation: "Visual identification systems include tiger tails, warning signs, powerline marker balls and different coloured markers."
  },
  {
    category: "Hazards & Controls",
    question: "If you hit powerlines with your forklift and must get off because it is unsafe to stay, how should you leave?",
    options: [
      "Step down normally using the handrail",
      "Jump clear, land with two feet together, and shuffle/hop away keeping feet together at least 8 m from the forklift",
      "Run in a straight line as fast as you can",
      "Climb down slowly touching the machine and the ground"
    ],
    answer: 1,
    explanation: "Stay in the forklift if it is safe. If unsafe, jump clear (not touching machine and ground at once), land with two feet together, and shuffle or hop away with feet together at least 8 metres from the forklift to avoid step potential."
  },
  {
    category: "Hazards & Controls",
    question: "What hazard control measures protect people/pedestrians from a forklift?",
    options: [
      "Warning signs, barriers/fencing, flashing hazard lights, exclusion zones and traffic management plans",
      "Driving faster to get past people",
      "Removing all lighting",
      "Turning off the horn"
    ],
    answer: 0,
    explanation: "Controls include warning signs, barriers/fencing, flashing hazard lights, flag people, traffic management plans and pedestrian/vehicle exclusion zones."
  },
  {
    category: "Hazards & Controls",
    question: "What should you do to stay safe when driving a forklift on a wet or slippery surface?",
    options: [
      "Drive faster to get across quickly",
      "Drive slowly, be extra careful, avoid ramps/slopes and avoid sudden braking",
      "Brake hard and often",
      "Raise the load high for balance"
    ],
    answer: 1,
    explanation: "On wet or slippery surfaces, drive slowly, be extra careful, avoid ramps and slopes, and avoid sudden braking."
  },
  {
    category: "Hazards & Controls",
    question: "Why do you turn off the engine when refuelling a forklift?",
    options: [
      "To save fuel",
      "Because the fuel can catch fire",
      "To reset the gauges",
      "It is not necessary to turn it off"
    ],
    answer: 1,
    explanation: "You turn off the engine when refuelling because the fuel can catch fire."
  },
  {
    category: "Hazards & Controls",
    question: "Why is it dangerous to use an internal-combustion (e.g. gas) forklift in a confined area?",
    options: [
      "It uses too much fuel",
      "You can breathe in dangerous exhaust gases",
      "The engine will overheat instantly",
      "The tyres wear faster"
    ],
    answer: 1,
    explanation: "In a confined area you can breathe in dangerous gases (exhaust fumes). The best forklift for that situation is an electric (battery) forklift, which does not produce these gases."
  },
  {
    category: "Hazards & Controls",
    question: "Why do you need good airflow when charging a forklift battery?",
    options: [
      "To keep the operator cool",
      "Charging batteries release explosive gases, and airflow reduces the risk of explosion",
      "To dry the paint",
      "To charge the battery faster"
    ],
    answer: 1,
    explanation: "When charging, batteries release explosive gases. Good airflow reduces the risk of an explosion."
  },
  {
    category: "Hazards & Controls",
    question: "Forklifts steer with their rear tyres, causing 'rear-end swing'. Why is this dangerous?",
    options: [
      "It makes the forklift slower",
      "Rear-end swing creates a risk of collision with people and structures",
      "It wears out the front tyres",
      "It has no real effect"
    ],
    answer: 1,
    explanation: "Because forklifts steer with the rear wheels, the rear end swings out when turning, creating a risk of collision with people and structures."
  },

  // ---------------------------------------------------------------
  // Communication
  // ---------------------------------------------------------------
  {
    category: "Communication",
    question: "How can you communicate with other people to ensure their safety around a forklift?",
    options: [
      "Signage, hand signals, eye contact, warning devices (horn) and two-way radios",
      "Only by shouting",
      "You do not need to communicate",
      "Only by email"
    ],
    answer: 0,
    explanation: "Communication methods include signage, written instructions, talking, two-way radios, hand signals, eye contact, warning devices such as the horn, worksite protocols, questioning to confirm understanding, and traffic warning systems."
  },
  {
    category: "Communication",
    question: "If your communication stops working, or you don't understand what a workmate signalled, what should you do?",
    options: [
      "Keep going and hope for the best",
      "Stop the forklift and get them to repeat the last signal",
      "Guess what they meant",
      "Sound the horn continuously"
    ],
    answer: 1,
    explanation: "Stop the forklift and get them to repeat the last signal. Never guess or keep operating when communication is unclear."
  },

  // ---------------------------------------------------------------
  // Pre-Start & Operational Checks
  // ---------------------------------------------------------------
  {
    category: "Pre-Start & Operational Checks",
    question: "When are pre-start checks performed?",
    options: [
      "After the forklift is turned on and moving",
      "BEFORE the forklift is turned on",
      "Once a month",
      "Only after a fault occurs"
    ],
    answer: 1,
    explanation: "Pre-start checks are performed BEFORE the forklift is turned on, to make sure there is no damage or faults and it is safe to use."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "Which is a correct pre-start check on the forks/tynes?",
    options: [
      "They are painted yellow",
      "Evenly spread, no sharp edges, and locking pins are in place",
      "They are as long as possible",
      "Only that they are warm"
    ],
    answer: 1,
    explanation: "Check that the forks are evenly spread, have no sharp edges, and that the locking pins are in place so the forks cannot move or slide off."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "If the data plate is damaged and you can't read it, what should you do?",
    options: [
      "Estimate the capacity and keep working",
      "Don't use the forklift — isolate it, tag it out, report it and record it in the log book",
      "Use it only for light loads",
      "Cover it with tape and continue"
    ],
    answer: 1,
    explanation: "Don't use the forklift. Isolate it, tag it out of service, report the issue, and fill out the problem in the log book. The data plate tells you the Safe Working Load."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "Why is it important to keep tyres at the correct air pressure?",
    options: [
      "To make the ride quieter",
      "To make sure the forklift remains stable",
      "To use less fuel",
      "It does not matter"
    ],
    answer: 1,
    explanation: "Correct tyre air pressure helps make sure the forklift remains stable."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "Which of these is a defect you would check for on wheels and tyres?",
    options: [
      "The tyre brand name",
      "Large chunks missing, uneven wear, worn tread, sidewall damage, flat tyre or insecure fitting",
      "The colour of the rim",
      "How shiny they are"
    ],
    answer: 1,
    explanation: "Check for large chunks missing, uneven wear, worn-down tyres, sidewall damage, a flat tyre, and tyres/wheels that are insecurely fitted."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "When are operational checks performed?",
    options: [
      "Before the pre-start checks",
      "After the pre-start checks, with the forklift turned on and running",
      "Only at the end of the shift",
      "Never — they are optional"
    ],
    answer: 1,
    explanation: "Operational checks are performed AFTER your pre-start checks, with the forklift turned on and running."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "Which is a correct operational check (engine running)?",
    options: [
      "Check the paint colour",
      "Check brakes and steering while moving, work the hydraulics fully, and test horn, lights and warning devices",
      "Check the tyre brand",
      "Check the data plate wording only"
    ],
    answer: 1,
    explanation: "Operational checks include testing brakes and steering while moving, running the mast/hydraulic controls to full extent, and checking the horn, reverse beeper, lights and gauges/warning lights."
  },
  {
    category: "Pre-Start & Operational Checks",
    question: "How should you get on and off a forklift?",
    options: [
      "Jump on and off",
      "Use three points of contact",
      "Step on the front tyre",
      "Only while it is still moving"
    ],
    answer: 1,
    explanation: "Always maintain three points of contact when getting on and off the machine (part of your operational routine before you move)."
  },

  // ---------------------------------------------------------------
  // Attachments & Guards
  // ---------------------------------------------------------------
  {
    category: "Attachments & Guards",
    question: "Where would you find out the correct way to secure an attachment on a forklift?",
    options: [
      "Ask another operator",
      "In the manufacturer's instructions",
      "Guess based on similar attachments",
      "On the tyre sidewall"
    ],
    answer: 1,
    explanation: "The correct way to secure an attachment is found in the manufacturer's instructions."
  },
  {
    category: "Attachments & Guards",
    question: "Where do you find the rated load capacity for a forklift and its attachments?",
    options: [
      "On the forklift's data plate",
      "On the pallet",
      "In the log book only",
      "You can't — you have to estimate it"
    ],
    answer: 0,
    explanation: "The rated load capacity for the forklift and attachments is found on the forklift's data plate."
  },
  {
    category: "Attachments & Guards",
    question: "What will likely happen to the load capacity of a forklift when you add an attachment?",
    options: [
      "It will increase",
      "It will be reduced (and the load centre distance could increase)",
      "It stays exactly the same",
      "It doubles"
    ],
    answer: 1,
    explanation: "Adding an attachment will likely reduce the load capacity, and the load centre distance could increase."
  },
  {
    category: "Attachments & Guards",
    question: "What is the main hazard when using a jib attachment?",
    options: [
      "It is too heavy to fit",
      "Reduced stability due to a change in the centre of gravity (and a swinging load)",
      "It uses more fuel",
      "It makes the horn quieter"
    ],
    answer: 1,
    explanation: "The main hazards of a jib are less load capacity and reduced stability due to a change in the centre of gravity, plus the swinging load."
  },
  {
    category: "Attachments & Guards",
    question: "What does the OVERHEAD GUARD on a forklift do?",
    options: [
      "Protects the operator from falling objects",
      "Stops the load sliding off the forks",
      "Holds the battery in place",
      "Protects the operator's feet"
    ],
    answer: 0,
    explanation: "The overhead guard protects the operator from falling objects. (The load backrest stops the load hitting the mast; the foot guard protects the operator's feet.)"
  },
  {
    category: "Attachments & Guards",
    question: "What does the LOAD BACKREST do?",
    options: [
      "Protects the operator's feet",
      "Protects the operator and stops the load from hitting the mast",
      "Provides a seat backrest",
      "Charges the battery"
    ],
    answer: 1,
    explanation: "The load backrest protects the operator and stops the load from falling back onto the mast."
  },

  // ---------------------------------------------------------------
  // General Operations
  // ---------------------------------------------------------------
  {
    category: "General Operations",
    question: "How can you find out the weight of the load you are about to lift?",
    options: [
      "Only by lifting it and feeling it",
      "Check the weighbridge/consignment note, labels/markings, weigh it, calculate it, or check inventory systems",
      "Guess from the size",
      "Ask a pedestrian"
    ],
    answer: 1,
    explanation: "Find the weight from the weighbridge or consignment note, labels/markings on the load, by weighing it, by calculating it (e.g. boxes × weight + pallet), or from inventory systems."
  },
  {
    category: "General Operations",
    question: "Why should you watch and monitor your load while moving?",
    options: [
      "To look professional",
      "To ensure the load and forklift are stable",
      "To count the boxes",
      "It is not necessary"
    ],
    answer: 1,
    explanation: "You watch and monitor the load while moving to ensure the load and forklift remain stable."
  },
  {
    category: "General Operations",
    question: "You can't see over or around your load. What should you do?",
    options: [
      "Drive forward slowly and hope",
      "Drive in reverse, use a guide/spotter, or repack the load",
      "Raise the load higher to see under it",
      "Have someone sit on the load to direct you"
    ],
    answer: 1,
    explanation: "If you can't see over or around the load, drive in reverse, use a guide or spotter, or repack the load."
  },
  {
    category: "General Operations",
    question: "Which way should your load face when driving on a ramp?",
    options: [
      "Facing down the ramp",
      "Facing UP the ramp (and travel in reverse when going down)",
      "Sideways across the ramp",
      "It does not matter"
    ],
    answer: 1,
    explanation: "The load should face UP the ramp. When driving down a ramp the load should still face up the ramp, so you travel in reverse."
  },
  {
    category: "General Operations",
    question: "What can happen if you turn a loaded forklift on a ramp or slope?",
    options: [
      "Nothing dangerous",
      "The load can fall off and the forklift can tip over",
      "The engine stalls",
      "The tyres deflate"
    ],
    answer: 1,
    explanation: "Turning a loaded forklift on a ramp or slope can cause the load to fall off and the forklift to tip over."
  },
  {
    category: "General Operations",
    question: "Why is it unsafe to raise or lower a load near people?",
    options: [
      "It wastes time",
      "The load or part of it could fall and injure or kill people",
      "It drains the battery",
      "It is actually fine near people"
    ],
    answer: 1,
    explanation: "The load, or part of it, could fall and injure or kill people, so never raise or lower a load near people."
  },
  {
    category: "General Operations",
    question: "Why is it dangerous to travel with the load raised in the air?",
    options: [
      "It blocks the sun",
      "The forklift has a much higher chance of tipping over",
      "It uses more hydraulic oil",
      "There is no danger"
    ],
    answer: 1,
    explanation: "Travelling with a raised load raises the centre of gravity and gives the forklift a much higher chance of tipping over."
  },
  {
    category: "General Operations",
    question: "When carrying a load, what is a safe height to carry it at?",
    options: [
      "As high as possible",
      "At axle height, or as low as practicable to the ground",
      "Exactly 1 metre off the ground",
      "Resting on the ground"
    ],
    answer: 1,
    explanation: "Carry the load at axle height, or as low as practicable to the ground. Take care on rough/bumpy surfaces to keep enough clearance."
  },
  {
    category: "General Operations",
    question: "Why is it dangerous to carry a load using only one fork arm?",
    options: [
      "It is faster but noisy",
      "The forklift and load will be unstable, and it can damage the tynes, mast or carriage",
      "It uses more fuel",
      "There is no real danger"
    ],
    answer: 1,
    explanation: "Carrying a load on one fork arm makes the forklift and load unstable and can damage the tynes, mast or carriage."
  },
  {
    category: "General Operations",
    question: "You're stacking things on top of each other. What do you need to make sure of?",
    options: [
      "The stack looks tidy",
      "The surface is level, the stack isn't too high/unstable, heavy goods are at the bottom and the lower load can support the upper load",
      "The lightest items are on the bottom",
      "The stack is as tall as possible"
    ],
    answer: 1,
    explanation: "Stack on a level surface, don't let the stack become too high and unstable, put heavy goods at the bottom, and make sure the load below can support the load above."
  },
  {
    category: "General Operations",
    question: "What should you place over the gap between a truck and a loading dock?",
    options: [
      "Nothing — drive straight across",
      "A secured bridge plate or dock plate",
      "A wooden pallet",
      "A sheet of cardboard"
    ],
    answer: 1,
    explanation: "Place a secured bridge plate or dock plate over the gap between the truck and the loading dock."
  },
  {
    category: "General Operations",
    question: "What should you do if the forklift has a machine failure such as loss of brakes, steering or hydraulics?",
    options: [
      "Keep working carefully",
      "Stop the forklift, activate the emergency stop procedure, lower it, lock and tag it out, and report it",
      "Restart it and continue",
      "Drive it back to the workshop at speed"
    ],
    answer: 1,
    explanation: "Stop the forklift, activate the emergency stop procedure, return it to the lowered position, lock out and tag out the forklift, report to management, and have it checked before use."
  },
  {
    category: "General Operations",
    question: "When can you carry passengers on a forklift?",
    options: [
      "Whenever there is room",
      "Only when the forklift is designed to do so, with an extra seat and seatbelt",
      "On the forks if they hold on",
      "Never, under any circumstances"
    ],
    answer: 1,
    explanation: "You can only carry passengers when the forklift is designed for it, with an extra seat and seatbelt."
  },

  // ---------------------------------------------------------------
  // Stability & Load Centre
  // ---------------------------------------------------------------
  {
    category: "Stability & Load Centre",
    question: "What can cause a forklift to tip over SIDEWAYS?",
    options: [
      "Driving slowly in a straight line",
      "Turning too fast, turning on a slope, uneven load/ground, or side-shift not centred",
      "Lowering the forks to the ground",
      "Parking with the brake on"
    ],
    answer: 1,
    explanation: "Sideways tip-overs can be caused by turning or driving too fast, uneven ground or load, turning with the load raised, side-shift not centred, turning on a slope, or a flat tyre."
  },
  {
    category: "Stability & Load Centre",
    question: "What can cause a forklift to tip over FORWARDS or BACKWARDS?",
    options: [
      "Carrying no load on level ground",
      "Overloading, load centre too far forward, load not pushed back, braking too hard, or driving with a raised load",
      "Wearing your seatbelt",
      "Sounding the horn at a doorway"
    ],
    answer: 1,
    explanation: "Forwards/backwards tip-overs can be caused by uneven ground/load, driving too fast, braking too hard, overloading, load centre too far forward, load not pushed back, incorrect tilt, slopes, a raised load, or hitting overhead obstructions."
  },
  {
    category: "Stability & Load Centre",
    question: "What should you do if your forklift is tipping over?",
    options: [
      "Jump clear immediately",
      "Stay in the forklift, brace yourself and lean away from the impact",
      "Stand up and grab the overhead guard",
      "Steer hard in the other direction"
    ],
    answer: 1,
    explanation: "If the forklift is tipping over, stay in the forklift, brace yourself, and lean away from the impact. Do NOT jump."
  },
  {
    category: "Stability & Load Centre",
    question: "Why must you always wear your seatbelt on a forklift?",
    options: [
      "It is just company policy",
      "It stops the operator falling out if it tips over, and stops them being thrown into the structure in a collision",
      "It stops the forklift tipping",
      "It is only needed at high speed"
    ],
    answer: 1,
    explanation: "The seatbelt stops the operator falling out if the forklift tips over, and stops them being thrown into the forklift structure in a collision."
  },
  {
    category: "Stability & Load Centre",
    question: "A forklift has a point of balance (fulcrum). Where is it?",
    options: [
      "At the counterweight",
      "At the front wheels/front axle",
      "At the operator's seat",
      "At the top of the mast"
    ],
    answer: 1,
    explanation: "The fulcrum (point of balance) is at the front wheels/front axle. The load on one side and the counterweight on the other balance across this point."
  },
  {
    category: "Stability & Load Centre",
    question: "How is the load centre distance measured?",
    options: [
      "From the counterweight to the load",
      "From the vertical face of the forks to the load's centre of gravity",
      "From the ground to the top of the load",
      "From the operator's seat to the forks"
    ],
    answer: 1,
    explanation: "The load centre distance is measured from the vertical face of the forks to the load's centre of gravity."
  },
  {
    category: "Stability & Load Centre",
    question: "If the load is not pushed back touching the heel of the forks, what effect does this have?",
    options: [
      "No effect at all",
      "The forklift's capacity is reduced and stability can be affected",
      "The capacity increases",
      "The forklift speeds up"
    ],
    answer: 1,
    explanation: "If the load is not pushed back to the heel of the forks, the load centre distance increases, so the forklift's capacity is reduced and stability can be affected."
  },
  {
    category: "Stability & Load Centre",
    question: "What is the most common load centre distance rating on a forklift in Australia, and why?",
    options: [
      "500 mm, because forks are 500 mm long",
      "600 mm, because standard Australian pallets are 1200 mm × 1200 mm",
      "1000 mm, because that is half a metre",
      "300 mm, because loads are small"
    ],
    answer: 1,
    explanation: "The most common load centre distance in Australia is 600 mm, because standard Australian pallets are 1200 mm × 1200 mm (half of 1200 mm is 600 mm)."
  },
  {
    category: "Stability & Load Centre",
    question: "Why should you keep your side-shift centralised when travelling with a load?",
    options: [
      "To make the forklift look neat",
      "To keep the forklift and the load stable",
      "To save hydraulic oil",
      "To reduce tyre wear"
    ],
    answer: 1,
    explanation: "Keeping the side-shift centralised keeps the forklift and the load stable."
  },

  // ---------------------------------------------------------------
  // Shutting Down
  // ---------------------------------------------------------------
  {
    category: "Shutting Down",
    question: "Where would you NOT park your forklift?",
    options: [
      "In a designated forklift parking bay",
      "In front of fire equipment, doorways, emergency exits, walkways or on a slope",
      "On level ground away from traffic",
      "Inside a marked parking area"
    ],
    answer: 1,
    explanation: "Do not park at first aid stations, fire-fighting equipment, doorways, emergency exits, ramps/slopes, pedestrian walkways, blocking traffic, under powerlines without clearance, or within 2 m of a rail track."
  },
  {
    category: "Shutting Down",
    question: "What are the correct steps when parking your forklift?",
    options: [
      "Leave the forks raised, engine running, in gear",
      "Lower the forks flat to the ground, put in neutral, apply the park brake, turn off and remove the key",
      "Leave it in a walkway with the beacon on",
      "Park on a slope with the load still on"
    ],
    answer: 1,
    explanation: "Lower the forks flat to the ground, put the forklift in neutral, apply the parking brake, turn off the forklift, and remove the key (then exit using three points of contact and turn off the gas if fitted)."
  },
  {
    category: "Shutting Down",
    question: "Why do you take the key out when you leave the forklift?",
    options: [
      "So you don't lose it",
      "To prevent an unauthorised person using the forklift",
      "To save the battery",
      "It is not necessary"
    ],
    answer: 1,
    explanation: "You remove the key to prevent someone who is not authorised from using the forklift."
  },

  // ---------------------------------------------------------------
  // Fuels, Batteries & Records (Additional)
  // ---------------------------------------------------------------
  {
    category: "Fuels, Batteries & Records",
    question: "When changing a gas bottle on a forklift, what is the first thing you should do?",
    options: [
      "Unscrew the connection straight away",
      "Ensure the gas is turned off",
      "Start the engine",
      "Remove your gloves"
    ],
    answer: 1,
    explanation: "First ensure the gas is turned off, then put on gloves, unscrew the connection, remove the empty bottle with safe manual handling, fit the new bottle, screw in the connection, turn the gas on and check for leaks/noises."
  },
  {
    category: "Fuels, Batteries & Records",
    question: "Would you top up the water levels in your battery before or after a charge, and why?",
    options: [
      "Before, so the battery charges faster",
      "After a charge, to prevent the water boiling over",
      "It makes no difference",
      "Never top up battery water"
    ],
    answer: 1,
    explanation: "Top up the water levels after a charge. This prevents the water boiling over during charging."
  },
  {
    category: "Fuels, Batteries & Records",
    question: "Where would you refuel your forklift truck?",
    options: [
      "Anywhere convenient",
      "In the designated refuelling area",
      "Next to the battery charger",
      "Inside a confined store room"
    ],
    answer: 1,
    explanation: "Refuel your forklift in the designated refuelling area."
  },
  {
    category: "Fuels, Batteries & Records",
    question: "What might you find on a Traffic Management Plan?",
    options: [
      "The forklift's service history",
      "Pedestrian and vehicle exclusion zones, exits, direction of travel and speed zones",
      "The operator's licence number",
      "The weather forecast"
    ],
    answer: 1,
    explanation: "A traffic management plan may show pedestrian exclusion zones, vehicle exclusion zones, exits, direction of travel and speed zones."
  },
  {
    category: "Fuels, Batteries & Records",
    question: "Which documents could you use to record information relating to the forklift?",
    options: [
      "Your personal diary",
      "The operator log book, pre-start checklist and service history book",
      "A newspaper",
      "The load's consignment note only"
    ],
    answer: 1,
    explanation: "Records include the operator log book, the pre-start checklist and the service history book."
  },

  // ---------------------------------------------------------------
  // Hierarchy of Control & Surfaces
  // ---------------------------------------------------------------
  {
    category: "Hierarchy of Control",
    question: "What is the correct order of the Hierarchy of Hazard Control (most to least effective)?",
    options: [
      "PPE, Admin, Engineering, Isolation, Substitution, Elimination",
      "Elimination, Substitution, Isolation, Engineering, Admin, PPE",
      "Elimination, PPE, Isolation, Admin, Engineering, Substitution",
      "Admin, Elimination, PPE, Isolation, Engineering, Substitution"
    ],
    answer: 1,
    explanation: "The order is Elimination, Substitution, Isolation, Engineering, Administration, then PPE — remembered by 'Every Saturday I Eat A Pie'. Elimination is the most effective; PPE is the last resort."
  },
  {
    category: "Hierarchy of Control",
    question: "In the hierarchy of control, PPE (personal protective equipment) should be used…",
    options: [
      "First, before anything else",
      "As the last resort, after all other measures have been applied and a risk still remains",
      "Instead of eliminating the hazard",
      "Only by supervisors"
    ],
    answer: 1,
    explanation: "PPE is the least effective control and is used as the last resort — after all other measures have been employed and a risk of injury or illness still remains."
  },
  {
    category: "Hierarchy of Control",
    question: "What is a danger of operating a forklift over potholes?",
    options: [
      "It cleans the tyres",
      "Risk of tipping over due to instability of the forklift",
      "It improves traction",
      "There is no danger"
    ],
    answer: 1,
    explanation: "Potholes create a risk of tipping over due to instability of the forklift. Other risky surfaces include soft/backfilled soil (sinking), railway tracks, trench covers and steel grates (may not hold the weight), and sloping surfaces."
  },
  {
    category: "Hierarchy of Control",
    question: "Why are trench covers and steel decks/grates a hazard for forklifts?",
    options: [
      "They are always slippery",
      "They may be loose and may not take the weight of the forklift",
      "They are too noisy",
      "They damage the tyres instantly"
    ],
    answer: 1,
    explanation: "Trench covers and steel decks/grates may be loose and may not take the weight of the forklift, causing it to fall or become unstable."
  },

  // ---------------------------------------------------------------
  // Calculations
  // ---------------------------------------------------------------
  {
    category: "Calculations",
    question: "A pallet holds cartons: 4 cartons per layer, 6 layers, each carton 25 kg, and the pallet weighs 15 kg. What is the total weight?",
    options: ["600 kg", "615 kg", "640 kg", "580 kg"],
    answer: 1,
    explanation: "4 × 6 = 24 cartons. 24 × 25 kg = 600 kg of cartons. Add the 15 kg pallet: 600 + 15 = 615 kg."
  },
  {
    category: "Calculations",
    question: "A load is 45 bags of flour at 20 kg each on a pallet weighing 30 kg. What is the total weight?",
    options: ["900 kg", "930 kg", "945 kg", "920 kg"],
    answer: 1,
    explanation: "45 × 20 kg = 900 kg of flour. Add the 30 kg pallet: 900 + 30 = 930 kg."
  },
  {
    category: "Calculations",
    question: "A forklift is rated 1670 kg at a 600 mm load centre. A load weighs 1670 kg and is 1300 mm long (load centre = half the length). Is it safe to lift?",
    options: [
      "Safe — the weight is exactly at capacity",
      "Unsafe — the load centre is 650 mm, which is 50 mm over the allowed 600 mm",
      "Safe — length does not matter",
      "Unsafe — the load is too heavy"
    ],
    answer: 1,
    explanation: "Load centre = 1300 ÷ 2 = 650 mm. At 1670 kg the load centre must be no more than 600 mm, so 650 mm is 50 mm too far — the load is UNSAFE to lift."
  },
  {
    category: "Calculations",
    question: "A forklift is rated 2280 kg at a 600 mm load centre. A load of 2280 kg is 1000 mm long. Is it safe?",
    options: [
      "Unsafe — it is over capacity",
      "Safe — the load centre is 500 mm, which is within the allowed 600 mm",
      "Unsafe — the load centre is 1000 mm",
      "Safe — only if tilted forward"
    ],
    answer: 1,
    explanation: "Load centre = 1000 ÷ 2 = 500 mm, which is 100 mm under the allowed 600 mm at 2280 kg — so the load is SAFE to lift."
  },
  {
    category: "Calculations",
    question: "A data plate shows a rated capacity of 1920 kg at a 600 mm load centre (mast vertical). Can a 1920 kg load with a 700 mm load centre be lifted in the vertical position?",
    options: [
      "Yes — the weight is fine",
      "No — the load centre is 100 mm over the allowed 600 mm at that weight",
      "Yes — load centre does not matter",
      "No — the load is too heavy"
    ],
    answer: 1,
    explanation: "The weight (1920 kg) equals capacity, but only at a 600 mm load centre. A 700 mm load centre is 100 mm too far, so the load canNOT be lifted safely."
  },
  {
    category: "Calculations",
    question: "A data plate shows 1920 kg (mast vertical) and 1650 kg (mast tilted forward 3°) at 600 mm. Can a 1730 kg load be lifted with the mast tilted forward 3°?",
    options: [
      "Yes — it is under 1920 kg",
      "No — with the mast tilted forward 3° the capacity is 1650 kg, so 1730 kg overloads it",
      "Yes — tilt does not change capacity",
      "No — the forklift cannot tilt forward"
    ],
    answer: 1,
    explanation: "Tilted forward 3° the rated capacity drops to 1650 kg. 1730 kg is over 1650 kg, so the forklift would be overloaded — it canNOT be lifted."
  },
  {
    category: "Calculations",
    question: "A shipping container holds a 5700 kg load; the container's tare (empty) weight is 2400 kg. The forklift is rated 6180 kg. Is the load within the weight rating?",
    options: [
      "Yes — 5700 kg is under 6180 kg",
      "No — total weight is 8100 kg, which exceeds 6180 kg",
      "Yes — tare weight does not count",
      "No — but only just under"
    ],
    answer: 1,
    explanation: "You must add the load and the container: 5700 + 2400 = 8100 kg. That is over the 6180 kg rated capacity, so it is NOT safe (the load centre distances also exceed the 920 mm rating)."
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = FORKLIFT_QUESTIONS;
}
