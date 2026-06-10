import React, { useState } from 'react';
import VideoPlayer from '../../player/VideoPlayer';
import { useNav } from '../App';
import { Quality } from '../../api/CatApi';

export default function Player({ qualities, headers, title, vodId, siteKey }: { qualities: Quality[]; headers: any; title: string; vodId?: string; siteKey?: string }) {
    const nav = useNav();
    const [qi, setQi] = useState(0);
    const q = qualities[qi] || qualities[0];
    return (
        <VideoPlayer
            uri={q.url}
            headers={headers}
            title={title}
            qualities={qualities}
            qi={qi}
            onQuality={setQi}
            onBack={nav.pop}
            vodId={vodId}
            siteKey={siteKey}
        />
    );
}
