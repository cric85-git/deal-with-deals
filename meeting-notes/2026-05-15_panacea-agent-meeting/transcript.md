# Transcript — Panacea Agent Meeting
**Session:** 2026-05-15 07:35:22

---

What I was thinking — first of all, what do you think about yesterday?

I think the meeting went well. To be very honest, Tapas — maybe I was seeing it from the screen — he looked a little distracted, but I think he gave valuable feedback in terms of what he wants the takeaway should be with Panos. But at a personal level I felt that he was excited to see that we are not just solving some trivial problems. We have identified some hard issues to be solved with our agentic workflow. So maybe he's part of some of those demos where he's seeing teams doing more trivial stuff using AI agents, versus what we were showing — these are hard problems that everybody across the world is looking to solve. So I think that was the biggest takeaway for me.

Yeah. So from my experience, most folks will do multiple things. Looks like he's chatting with this agent. It's my guess because when we exited, "oh you will receive an email from my agent." So I was talking about how I developed, how I used MeshClaw autopilot to actually orchestrate the whole thing. He was saying "I am doing the same thing, you will receive an email soon." So maybe he's talking with the agent or the agent is talking back. So that's what I am thinking.

I think one of the papers that he's sent is very good — the transfer learning one. But the current industry is going one more step. They are calling it transfer models or advisory models. What they are saying is the input prompt is sent via advisory model to enrich, and the enriched prompt goes to the frontier models. Which is what he's trying to do — hey, can we create an advisory model for Kanto Crash? Advisory model for Fire TV crash, advisory model for this, and use frontier models to execute it. Actually I want to try it out. It's a step ahead, but what I am trying to do is also moving towards it.

Okay, coming back. In my mind, there are three things that I have.

Number one — I was experimenting a lot with high cognitive load tasks. High cognitive load agentic workflows. What I found out is it's like a human being. The moment it crosses the cognitive load, it tends to complete in a rush, and the quality suffers. So what you need to do is you need to create subagents to orchestrate. Now the orchestrator has a problem because the moment you add more people to it, one guy will say "oh I won't do it," one guy will say something, because it's all probability models, right? Then the orchestrator has to take a stick and then monitor each of these guys — "your output is wrong, redo the output, I cannot go forward." So it kind of takes a stick, which means high cognitive load for the orchestrative agent. So you need to tread this fine balance to get a superior output out of it. So this is a problem that I have solved in my previous domain, which I need to tune, and it takes a lot of time. Though it is all orchestrated by the agents, I need to be very careful because I need to carefully review the output. So this is one stream I have to do.

The other stream is whatever code I have, I need to productionize. That is kind of like a more reasonable task. Right now I am used to — I have trained my MeshClaw with my orchestration, I can proceed in that direction.

Okay. The third thing is the next big things we need to focus on. So as you rightly called out, the "aw" was not there — we need to bring certain partners and get them to use this tool and provide us feedback. So the other thing that he asked about — the anecdotes are not there because no one is using these tools. So we need to drive that. These are some of the things that I am trying to do.

What I want is we need to have a streamlined workflow orchestration that needs to be done where — basically, you or someone needs to take the orchestrator position who needs to provide some kind of direction where we can orchestrate this entire thing, how you can deliver it in a nice manner.

See here's the thing. Based on yesterday's ending remarks from Tapas, I feel like from a product day perspective, what we have today, there is no specific need to build something new in next 10 days. Okay. Let me finish my thought. We may want to reposition a few things, reword a few things that leaves an impact for Panos. When we scrub through things, we don't want to go too technical. We don't want to show too much of agentic workflows, too much of scrolling and all. We'll lose his attention. We want to start with something that happens.

I said next time Jesse reaches out for you, your response is now going to be "our agent has already identified it and a fix is being deployed." And this is that fix that agent has found directly taking there.

Now in parallel, let's put our product day on the side for a moment. From now and June 3rd, we need to carve out a plan to say how we are going to productionalize this with one solid partner being Device OS. So for Kanto Mercer and the blank screen detection model, we will do this end-to-end agent workflow where analyzers will run, where you will be able to integrate with AgentSpaces, come up with a CR and then put it out there.

Okay, so correct. So we are not going to change anything for the product day, but there are two things. The fact that it is running in DevDust is something I am not very comfortable. So we should tend towards taking this exact POC. So what I will do is I will freeze the branch that currently I have. Whatever I have, make it running in production. As-is, low cognitivity, very simple, whatever is out there. So while I tune this agent, sub-agent, orchestrator with more capabilities — that work?

I need help. And that is something — see what I'm thinking is next week sometime. I have my one-on-one with Madul on Monday, so I'll get some clarity there. But I set up a call with you on Tuesday to say what exactly are the areas where you need extra hands, and for what purpose.

So what will help me, Srivathsan, is between today and Monday noon, if you can send just an email to me saying that hey, this is the whole scope of work that is needed for my agent. I can give this much of capacity and achieve these few milestones. These are the additional ones I really need. So I can have that conversation with Madul to see from where we can pull some resources, right?

Because we don't have — let's just say that NSA team has a lot of L-force right now and just Anindya. Now Anindya can't do everything. He's still working on that import flow and all of those things, right? So how we can utilize Anindya and couple of other L5 or another L6 from somewhere to help you so that we move faster between now and end of June.

This is where I am kind of confused. Francesco and Anindya are going to take this, or is Vishal's team going to take it? I don't understand the split between Francesco's team and Vishal's team.

Yeah, so again, the way things are shaping up is Vishal right now is gonna wear the hat of STM for crashes and logs until we find the logs STM, right? So he's gonna — nobody occupied there. Vishal has taken the ownership of building the troubleshooting agent and that agent doc and everything, correct? So now that is where I also want to get some clarity from Madul. The positioning now that hey, completely troubleshooting agent moves under Francisco and Anindya starts taking lead on it as a senior SDE, because with Vishal having both crashes and logs, his bandwidth would also be coming way too much now, right?

So again, a lot has happened in last two weeks to get more clarity. Monday is one of the things that we're gonna do — these things that I'm gonna talk to Madul about, that where do we position this troubleshooting agent. Ideally it should go to Francisco because he owns NSA as an STM, right? So if somebody is a Panacea Orchestration Service owner, the Panacea diagnosis agent and everything should house there.

Panacea Orchestrator as a different domain and Panacea agent workflow is a different domain is what I am seeing. And my personal opinion is we need at least an L5 to do this work. A set of L4s who have no architecture experience — that might work if they exactly follow what I have done and what I have to do. It might well be the case that I may push forward getting Sarah's help to work with you on there. So Anindya is working on the import flow. That way we expedite it. And anyways he's working on diagnosis MCP. So to integrate diagnosis with the agent will also help. So we'll see how it goes.

Okay. The other thing — if we are not able to get resources and things like that, the other idea that I am having is: okay, give it to me. I will slowly use my orchestration that I have built to do it, but it will go slowly. No, no, I don't think so. Here we have people, it's more about managing who will work on what for next two months. Correct. So we'll make that happen. Don't worry about that. Because I don't want to lose the momentum we have gained. Exactly the point.

And I did reach out to Bijou. I gave him a heads up — hey, here are the couple of things that we are working in parallel. We are working on this blank screen issue detection, as well as we are working on this end-to-end agent to go through that we were talking about.

Yeah, yeah. Oh, that stream that I have not talked about, right? This advisory models. So okay. Here is my thing. I think it is a very good idea to prove that hey this advisory model will work. I am also moving that stream as well. The reason why I was able to do three things is I built this pipeline where I create a SIM, my agent goes out on autopilot and it works on the POC and it commits the code.

So one thing I am — you need to be also mindful — this context switching is making me very tired. It's actually very hard after some point of time. So you can hold up on that. Whatever we started initially, let's prove that and then take that as your next iteration.

Okay, but the thing — correct. So you are right. That's exactly what I'm going to do. We are not going to start with the model. But the thing is I looked at the 56 Jiras Richard has sent to me for Kali. And what I have learnt from it is by scrubbing through it — I am actually taking a ground truth, meaning issue-result, issue-result, where I can test the model for its accuracy. Number two, do I need any additional tooling is what I am asking. So I need to deep dive more on these 56 issues and figure out do we have all the tooling needed for Kanto Mercer troubleshooting. The short answer is yes. The only gap is logs. Logs agent we need to properly integrate. It is not well integrated into the system.

So I will work on two things. Number one: continue implementing the POC. I will branch it out. I will label this branch as product day branch code freeze. I will not make any more changes to that. Start working on tuning this agent in such a way that it solves Kali and Kanto Mercer problems. Yeah. So that will be my focus for the next 15 days.

Yeah. And maybe what we can do is as a forcing function, right? Maybe end of first week of June, I'll just put a meeting with Bijou and Richard to give an initial POC demo. Then hey, in beta, here is what we are doing. For all the beta devices, right? For the beta rollout — here is what you can do now, or you can get. So maybe we'll commit ourselves to a meeting date so that we work towards it.

So that will be — these are all the things we need to closely track the milestones and we need to make sure that we are moving in that direction. So do me a favor — send that email to me between now and Monday afternoon with the work that you are expecting to do for this whole end-to-end integration and which areas you need help with.

I will see, I will feed this meeting notes to the agent, it will send you that blurb soon.

Alright. Cool. Any anything you want to give feedback, etc.?

Actually I was talking to Madul about this. So a couple of years back I had mentioned this to Madul that — I've been here now five years. One thing that I've not seen is us innovating in an area where we file for a patent. That has not happened in DS2.

And I was telling him that when I speak with you next, it's something I'll bring up. Maybe we now have an opportunity with a lot of agentic work that we are doing that we think — what makes it so innovative that we will push for filing a patent for our team?

Yeah, that makes sense. I felt the same thing. There is a lot of patents we could have filed. But absolutely there is absolutely no bandwidth. Let's identify which are the areas where we can file for patent, what type of innovation we can do, which is gonna help device or our product lines, and then see where we're gonna be able to get that input in terms of energy and resourcing that is needed to support that.

And I'm gonna be in Bellevue 26 May to 29th May. So for product day inputs and a couple of days. So we'll have opportunity to sit and talk — you, me, Anindya, Madul. So we'll have some face-to-face meetings there.

But that's something to keep in mind. Yeah, I will think about that as well. That is something I was thinking deeply. I was not able to get my hands on it as well. Yeah, this time we will do. Sounds good. Cool. Thanks.
