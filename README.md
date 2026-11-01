## Motivation

A Developer will most probably be sitting on his terminal all day long but the software for the workflows are web optimized, which are mostly slow, clunky and not so developer friendly.

So I decided to build those apps in the terminal itself. Apps based on TUI are fast, keyboard friendly and are effective for all the geeks and nerds out there.

## Task TUI

This is a basic TUI for task management across teams with support for multiple projects and team collabration in mind.

TUI is initiutive written in Ink and react. Server is written using Node.js and express and I have used postgresql for storage.

1. Builds are automatic for every major platform using Github actions.
2. Server is deployed on a basic managed service with a DB instance.
3. Members can join any project using the join code and can start collabarating right away.

Caveat: Auth session is not persistent for now, so everytime you open the TUI, it will need to be re logged in. I will add persistence in future.

Head over to the Releases to test it out on your platform and it will auto connect to a server that I hosted in render
