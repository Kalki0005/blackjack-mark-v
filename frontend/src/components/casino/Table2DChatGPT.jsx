import { useEffect, useRef, useState } from "react"

export const TABLE_VIEW = {
  w: 1600,
  h: 900,
}

const pct = ({ x, y }) => ({
  xPct: (x / TABLE_VIEW.w) * 100,
  yPct: (y / TABLE_VIEW.h) * 100,
})


// ------------------------------------------------
// Smooth shoe/discard animations
// ------------------------------------------------

function useSmoothed(target, ms = 700) {
  const [val, setVal] = useState(target)
  const ref = useRef(target)

  ref.current = val

  useEffect(() => {
    const start = ref.current
    const t0 = performance.now()

    let frame

    function tick(t) {
      const p = Math.min(1, (t - t0) / ms)
      const ease = 1 - Math.pow(1 - p, 3)

      setVal(start + (target - start) * ease)

      if (p < 1)
        frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [target])

  return val
}



// ------------------------------------------------
// Positions copied to match screenshot perspective
// ------------------------------------------------

const seats = [
  [350, 690],
  [500, 755],
  [650, 790],
  [800, 805],
  [950, 790],
  [1100,755],
  [1250,690],
]


export const SEAT_ANCHORS = seats.map(([x,y],i)=>({
  seat:i+1,
  x,
  y,
  ...pct({x,y})
}))


export const SHOE_ANCHOR =
  pct({x:1180,y:430})

export const DEALER_CARD_ANCHOR =
  pct({x:800,y:470})




// ------------------------------------------------
// Acrylic shoe
// ------------------------------------------------

function Shoe({fill}) {

const width = 90 * fill

return (

<g transform="
translate(1165 410)
rotate(-16)
scale(1.15)
">

<ellipse
cx="20"
cy="80"
rx="130"
ry="25"
fill="black"
opacity=".25"
/>


<path
d="
M -100 20
L 120 -40
L 150 -10
L -70 55
Z
"
fill="rgba(220,245,255,.25)"
stroke="white"
strokeOpacity=".55"
strokeWidth="3"
/>


<path
d={`
M ${20-width} 5
L 85 -12
L 90 35
L ${20-width} 50
Z
`}
fill="#d7dde0"
/>


<path
d="
M120 -40
L150 -10
L150 45
L120 65
Z"
fill="rgba(180,230,255,.22)"
stroke="white"
strokeOpacity=".5"
/>


</g>

)

}




// ------------------------------------------------
// Discard rack
// ------------------------------------------------


function DiscardRack({fill}){

return (

<g transform="
translate(430 420)
rotate(16)
scale(1)
">


<ellipse
cx="0"
cy="80"
rx="95"
ry="20"
fill="black"
opacity=".25"
/>


<path
d="
M -80 -25
L 70 -35
L 80 50
L -70 55
Z
"
fill="rgba(220,245,255,.22)"
stroke="white"
strokeOpacity=".5"
strokeWidth="3"
/>


<rect
x="-45"
y={30-(60*fill)}
width="90"
height={60*fill}
fill="#dfe4e6"
/>


</g>

)

}




function BetSpot({x,y}){

return (

<g>

<ellipse
cx={x}
cy={y}
rx="38"
ry="22"
fill="#087b85"
stroke="rgba(255,255,255,.7)"
strokeWidth="3"
/>


<circle
cx={x}
cy={y}
r="9"
fill="white"
opacity=".9"
/>


</g>

)

}

// ------------------------------------------------
// Main Table Component
// ------------------------------------------------

export function Table2D({
  shoeFill = 0.85,
  discardFill = 0.15,
  className = "",
  style
}) {

const smoothShoe = useSmoothed(shoeFill)
const smoothDiscard = useSmoothed(discardFill)


return (

<svg
className={className}
style={style}
viewBox="0 0 1600 900"
preserveAspectRatio="xMidYMid meet"
xmlns="http://www.w3.org/2000/svg"
>


<defs>


{/* Felt gradient */}
<radialGradient
id="feltGradient"
cx="50%"
cy="35%"
r="70%"
>

<stop
offset="0%"
stopColor="#22c4cb"
/>

<stop
offset="60%"
stopColor="#0b9ba5"
/>

<stop
offset="100%"
stopColor="#006b75"
/>

</radialGradient>



{/* subtle cloth texture */}
<pattern
id="cloth"
width="8"
height="8"
patternUnits="userSpaceOnUse"
>

<circle
cx="2"
cy="2"
r=".7"
fill="rgba(255,255,255,.08)"
/>

<circle
cx="6"
cy="6"
r=".7"
fill="rgba(0,0,0,.08)"
/>

</pattern>



{/* text curves */}
<path
id="blackjackText"
d="
M 480 570
Q 800 650
1120 570
"
/>


<path
id="insuranceText"
d="
M 520 650
Q 800 710
1080 650
"
/>


</defs>





{/* -------------------------
    TABLE BODY SHADOW
------------------------- */}


<ellipse
cx="800"
cy="655"
rx="735"
ry="320"
fill="black"
opacity=".35"
/>




{/* -------------------------
    BLUE TABLE SIDE DEPTH
------------------------- */}


<ellipse
cx="800"
cy="620"
rx="720"
ry="315"
fill="#07515d"
/>


<ellipse
cx="800"
cy="595"
rx="705"
ry="300"
fill="#0c7180"
/>





{/* -------------------------
    GREY RUBBER RAIL
------------------------- */}


<ellipse
cx="800"
cy="570"
rx="690"
ry="285"
fill="#c8c8c4"
/>


<ellipse
cx="800"
cy="560"
rx="625"
ry="245"
fill="url(#feltGradient)"
/>


<ellipse
cx="800"
cy="560"
rx="625"
ry="245"
fill="url(#cloth)"
opacity=".45"
/>






{/* -------------------------
    DEALER INNER ARC
------------------------- */}


<path
d="
M 470 510
Q 800 590
1130 510
"
stroke="rgba(255,255,255,.55)"
strokeWidth="3"
fill="none"
/>






{/* -------------------------
    TABLE TEXT
------------------------- */}


<text
fontFamily="Georgia"
fontSize="38"
fontWeight="700"
fill="rgba(240,255,255,.9)"
letterSpacing="4"
>

<textPath
href="#blackjackText"
startOffset="50%"
textAnchor="middle"
>

BLACKJACK PAYS 3 TO 2

</textPath>

</text>




<text
fontFamily="Arial"
fontSize="21"
fontWeight="700"
fill="rgba(255,220,90,.95)"
letterSpacing="3"
>

<textPath
href="#insuranceText"
startOffset="50%"
textAnchor="middle"
>

INSURANCE PAYS 2 TO 1

</textPath>


</text>





{/* -------------------------
    EQUIPMENT
------------------------- */}


<DiscardRack fill={smoothDiscard}/>

<Shoe fill={smoothShoe}/>






{/* -------------------------
    PLAYER SPOTS
------------------------- */}


{
SEAT_ANCHORS.map(s=>(

<BetSpot
key={s.seat}
x={s.x}
y={s.y}
/>

))
}




</svg>

)

}







// ------------------------------------------------
// Standalone preview
// ------------------------------------------------


export default function Table2DViewer(){


return (

<div
style={{
position:"fixed",
inset:0,
background:"transparent",
display:"flex",
alignItems:"center",
justifyContent:"center",
overflow:"hidden"
}}
>


<Table2D
style={{
width:"100vw",
height:"100vh"
}}
/>


</div>


)

}