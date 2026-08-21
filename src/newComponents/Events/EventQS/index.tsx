import React, { useState, useCallback, useEffect, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BASEVENTNAME,
  LINEAEVENTNAME,
  EARLYBIRDNFTEVENTNAME,
  ETHSIGNEVENTNAME,
} from '@/config/events';
import PButton from '@/newComponents/PButton';

import './index.scss';
const basQsMap = {
  1: {
    id: 1,
    question: 'Does the connected wallet address matter?',
    answer:
      'The wallet address connected in the top right corner serves two key functions: it records your task complete process and determines your eligibility for events checking. Changing the connected wallet address will also impact the tasks process displayed in the task list. Make sure you connect the same wallet address here and on the BAS attestation alliance campaign page.',
  },
  2: {
    id: 2,
    question: 'Do I need to complete all four attestation tasks in Task 2? ',
    answer:
      'Each attestation task comes with different XPS points and is not tied together. To maximize your pointes, you have to complete all of them in the Task 2 and submit them in one click in the Task 3.',
  },
  3: {
    id: 3,
    question: 'What should I do if the attestation process fails? ',
    answer:
      'As the attestation is undergoing the zkTLS process, it often depends on your internet connection. A quick solution is to connect to a new wifi network or switch to a different VPN node, if possible. If you receive an error message with an error code, feel free to contact us in the Discord #help channel.',
  },
  4: {
    id: 4,
    question: 'Can I join this event with a different wallet address? ',
    answer:
      'Yes, you can join this event with different wallet address. When you change the connected wallet above the task list, the task status will reset and you can go through it with the newly connected wallet address. Remember, you also need to connect the new address on the BAS attestation alliance campaign page to earn your BAS XPS with this new address.',
  },
  // 5: {
  //   id: 5,
  //   question: 'How are Primus points for this event counted?',
  //   answer:
  //     'For Primus points, it is counted based on your Primus extension account, which means the points will not be double counted when you switch wallet address.',
  // },
};
const lineaQsMap = {
  1: {
    id: 1,
    question: 'Does the connected wallet address matter?',
    answer:
      'The wallet address connected in the top right corner serves two key functions: it records your task complete process and determines your eligibility for events checking. Changing the connected wallet address will also impact the tasks process displayed in the task list. Make sure you connect the same wallet address here and on the Linea event page.',
    // expand: true,
  },
  2: {
    id: 2,
    question: 'What should I do if the attestation process fails? ',
    answer:
      'As the attestation is undergoing the zkTLS process, it often depends on your internet connection. A quick solution is to connect to a new wifi network or switch to a different VPN node, if possible. If you receive an error message with an error code, feel free to contact us in the Discord #help channel.',
    // expand: true,
  },
  // 5: {
  //   id: 5,
  //   question: 'How are Primus points for this event counted?',
  //   answer:
  //     'For Primus points, it is counted based on your Primus extension account, which means the points will not be double counted when you switch wallet address.',
  //   // expand: true,
  // },
};
const earluBirdQsMap = {
  1: {
    id: 1,
    question: 'Can I join this event with a different wallet address? ',
    answer:
      'No, the Early Bird NFT event is only available to early active users, based on the Primus extension account and the wallet address that participated in the event. If you have already claimed an NFT through your current Primus extension, you will not be able to claim again by connecting another wallet through the top right corner.',
    // expand: true,
  },
  2: {
    id: 2,
    question: 'What should I do if the attestation process fails? ',
    answer:
      'As the attestation is undergoing the zkTLS process, it often depends on your internet connection. A quick solution is to connect to a new wifi network or switch to a different VPN node, if possible. If you receive an error message with an error code, feel free to contact us in the Discord #help channel.',
    // expand: true,
  },
  // 3: {
  //   id: 3,
  //   question: 'How are Primus points for this event counted?',
  //   answer:
  //     'For Primus points, it is counted based on your Primus extension account, which means the points will not be double counted when you switch wallet address.',
  //   // expand: true,
  // },
};
const ethSignQsMap = {
  1: {
    id: 1,
    question: 'Does the connected wallet address matter? ',
    answer:
      'The wallet address connected in the top right corner serves two key functions: it records your task complete process and determines your eligibility for events checking. Changing the connected wallet address will also impact the tasks process displayed in the task list.',
    // expand: true,
  },
  2: {
    id: 2,
    question: 'What should I do if the attestation process fails?',
    answer:
      'As the attestation is undergoing the zkTLS process, it often depends on your internet connection. A quick solution is to connect to a new wifi network or switch to a different VPN node, if possible. If you receive an error message with an error code, feel free to contact us in the Discord #help channel.',
    // expand: true,
  },
  3: {
    id: 3,
    question: 'Can I join this event with a different wallet address?',
    answer:
      'Yes, you can join this event with different wallet address. When you change the connected wallet above the task list, the task status will reset and you can go through it with the newly connected wallet address.',
    // expand: true,
  },
  // 4: {
  //   id: 4,
  //   question: 'How are Primus points for this event counted?',
  //   answer:
  //     'For Primus points, it is counted based on your Primus extension account, which means the points will not be double counted when you switch wallet address.',
  //   // expand: true,
  // },
};
const eventQsMap = {
  [BASEVENTNAME]: basQsMap,
  [LINEAEVENTNAME]: lineaQsMap,
  [EARLYBIRDNFTEVENTNAME]: earluBirdQsMap,
  [ETHSIGNEVENTNAME]: ethSignQsMap,
};
const DataSourceItem = memo(() => {
  const [questionList, setQuestionList] = useState<any[]>([]);
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('id') as string;
  const questionMap = eventQsMap[eventId];
  const handleExpand = useCallback((i) => {
    const { expand } = questionMap[i.id];
    questionMap[i.id].expand = !expand;
    setQuestionList(Object.values(questionMap));
  }, []);
  useEffect(() => {
    setQuestionList(Object.values(questionMap));
  }, []);
  return (
    <div className="qsList">
      <h3 className="title">Frequently asked questions?</h3>
      <ul className="qss">
        {questionList.map((i, k) => {
          return (
            <li className="qs" key={k}>
              <p className="question">
                <span>{i.question}</span>
                <PButton
                  type="icon"
                  icon={
                    <i
                      className={`iconfont ${
                        i.expand ? 'icon-iconMinus' : 'icon-Add'
                      } `}
                    ></i>
                  }
                  onClick={() => handleExpand(i)}
                />
              </p>
              {i.expand && <p className="answer">{i.answer}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export default DataSourceItem;
