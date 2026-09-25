This directory models learner memories and the profile that stores them. Keep ID-free `LearnerMemory` separate from profile-stored `LearnerProfileMemory`; the profile owns memory identity and updates.

Before changing behavior, inspect the current types, profile operations, extraction contract, and nearby tests. Keep extraction policy separate from profile storage, and verify new categories work across both. Test shared memory behavior rather than hard-coding today's categories.
