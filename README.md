# recast, _v_.
1. to give (a metal object) a different form by melting it down and reshaping it.
1. to form, fashion, or arrange again.
1. to remodel or reconstruct (a literary work, document, sentence, etc.).
1. to supply (a theater or opera work) with a new cast.

# Installation

From NPM:

    npm install recast
    
From GitHub:

    cd path/to/node_modules
    git clone git://github.com/benjamn/recast.git
    cd recast
    npm install .

# Motivation

The more code you have, the harder it becomes to make big, sweeping changes quickly and confidently. Even if you trust yourself not to make too many mistakes, and no matter how proficient you are with your text editor, changing tens of thousands of lines of code takes precious, non-refundable time.

Is there a better way? Not always! When a task requires you to alter the semantics of many different pieces of code in subtly different ways, your brain inevitably becomes the bottleneck, and there is little hope of completely automating the process. Your best bet is to plan carefully, buckle down, and get it right the first time. Love it or loathe it, that's the way programming goes sometimes.

What I hope to eliminate are the brain-wasting tasks, the tasks that are bottlenecked by keystrokes, the tasks that can be expressed as operations on the _syntactic structure_ of your code. Specifically, my goal is to make it possible for you to run your code through a parser, manipulate the abstract syntax tree directly, subject only to the constraints of your imagination, and then automatically translate those modifications back into source code, without upsetting the formatting of unmodified code.

And here's the best part: when you're done running a Recast script, if you're not completely satisfied with the results, blow them away with `git reset --hard`, tweak the script, and just run it again. Change your mind as many times as you like. Instead of typing yourself into a nasty case of [RSI](http://en.wikipedia.org/wiki/Repetitive_strain_injury), gaze upon your new wells of free time and ask yourself: what now?

-----

Recast is ready for use with JavaScript today. There's nothing particularly JavaScript-specific about the ideas involved, but I write a lot of JS, and [a good parser](https://github.com/ariya/esprima/) was readily available. If these ideas gain sufficient traction in the JavaScript community, more languages will undoubtedly follow.
