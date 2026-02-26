import React from 'react';

import pokeBallImg from '../assets/balls/pokeball.png';
import greatBallImg from '../assets/balls/greatball.png';
import ultraBallImg from '../assets/balls/ultraball.png';
import masterBallImg from '../assets/balls/masterball.png';

// Special ball placeholder assets (swap these later)
import netBallImg from '../assets/balls/special/net.png';
import diveBallImg from '../assets/balls/special/dive.png';
import loveBallImg from '../assets/balls/special/love.png';
import beastBallImg from '../assets/balls/special/beast.png';
import duskBallImg from '../assets/balls/special/dusk.png';
import luxuryBallImg from '../assets/balls/special/luxury.png';
import premierBallImg from '../assets/balls/special/premier.png';
import timerBallImg from '../assets/balls/special/timer.png';
import repeatBallImg from '../assets/balls/special/repeat.png';
import fastBallImg from '../assets/balls/special/fast.png';
import moonBallImg from '../assets/balls/special/moon.png';
import dreamBallImg from '../assets/balls/special/dream.png';
import nestBallImg from '../assets/balls/special/nest.png';
import quickBallImg from '../assets/balls/special/quick.png';

export default function PokeballIcon({ variant = 'poke', size = 64 }) {
  const s = size;
  const src = {
    poke: pokeBallImg,
    great: greatBallImg,
    ultra: ultraBallImg,
    master: masterBallImg,

    net: netBallImg,
    dive: diveBallImg,
    love: loveBallImg,
    beast: beastBallImg,
    dusk: duskBallImg,
    luxury: luxuryBallImg,
    premier: premierBallImg,
    timer: timerBallImg,
    repeat: repeatBallImg,
    fast: fastBallImg,
    moon: moonBallImg,
    dream: dreamBallImg,
    nest: nestBallImg,
    quick: quickBallImg,
  }[variant] || pokeBallImg;

  return (
    <img
      src={src}
      width={s}
      height={s}
      className="ballIconImg"
      alt={`${variant} ball`}
      draggable={false}
    />
  );
}
