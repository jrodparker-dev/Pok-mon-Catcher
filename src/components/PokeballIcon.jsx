import React from 'react'

import pokeBallImg from '../assets/balls/pokeball.png'
import greatBallImg from '../assets/balls/greatball.png'
import ultraBallImg from '../assets/balls/ultraball.png'
import masterBallImg from '../assets/balls/masterball.png'

export default function PokeballIcon({ variant = 'poke', size = 64 }) {
  const s = size;
  const src = {
    poke: pokeBallImg,
    great: greatBallImg,
    ultra: ultraBallImg,
    master: masterBallImg,
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
