import type { FamilyTree } from '../types/koseki';

// Fictional three-generation sample so the app shows something on first load.
// All names and dates are made up.
export const sampleTree: FamilyTree = {
  version: 1,
  meta: {
    title: '田中家 家系図（サンプル）',
    createdAt: '2026-07-23',
    note: 'これは動作確認用の架空データです。',
  },
  persons: [
    // Generation 1
    { id: 'p1', familyName: '田中', givenName: '太郎', familyNameKana: 'たなか', givenNameKana: 'たろう', sex: 'male', birth: { iso: '1920', raw: '大正9年' }, death: { iso: '1998' }, relationInRegister: '筆頭者' },
    { id: 'p2', familyName: '田中', givenName: '花子', familyNameKana: 'たなか', givenNameKana: 'はなこ', sex: 'female', birth: { iso: '1925', raw: '大正14年' }, death: { iso: '2005' }, relationInRegister: '妻' },
    // Generation 2
    { id: 'p3', familyName: '田中', givenName: '一郎', familyNameKana: 'たなか', givenNameKana: 'いちろう', sex: 'male', birth: { iso: '1950' }, relationInRegister: '長男' },
    { id: 'p4', familyName: '田中', givenName: '幸子', familyNameKana: 'たなか', givenNameKana: 'さちこ', sex: 'female', birth: { iso: '1953' }, relationInRegister: '長女' },
    { id: 'p5', familyName: '田中', givenName: '美咲', familyNameKana: 'たなか', givenNameKana: 'みさき', sex: 'female', birth: { iso: '1955' }, relationInRegister: '妻', note: '旧姓 佐藤' },
    // Generation 3
    { id: 'p6', familyName: '田中', givenName: '健太', familyNameKana: 'たなか', givenNameKana: 'けんた', sex: 'male', birth: { iso: '1980' }, relationInRegister: '長男' },
    { id: 'p7', familyName: '田中', givenName: '由美', familyNameKana: 'たなか', givenNameKana: 'ゆみ', sex: 'female', birth: { iso: '1983' }, relationInRegister: '長女' },
    { id: 'p8', familyName: '田中', givenName: '恵', familyNameKana: 'たなか', givenNameKana: 'めぐみ', sex: 'female', birth: { iso: '1982' }, relationInRegister: '妻', note: '旧姓 鈴木' },
    // Generation 4
    { id: 'p9', familyName: '田中', givenName: '大輔', familyNameKana: 'たなか', givenNameKana: 'だいすけ', sex: 'male', birth: { iso: '2010' }, relationInRegister: '長男' },
  ],
  unions: [
    { id: 'u1', partnerIds: ['p1', 'p2'], type: 'married', childIds: ['p3', 'p4'] },
    { id: 'u2', partnerIds: ['p3', 'p5'], type: 'married', childIds: ['p6', 'p7'] },
    { id: 'u3', partnerIds: ['p6', 'p8'], type: 'married', childIds: ['p9'] },
  ],
  registers: [
    {
      id: 'r1',
      honseki: '東京都千代田区一番地',
      headId: 'p1',
      createdReason: '婚姻による新戸籍編製',
      memberIds: ['p1', 'p2', 'p3', 'p4'],
    },
  ],
};
