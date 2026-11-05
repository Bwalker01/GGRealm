import { defineContract, now } from '@prisma/orm-postgres/contract-builder';

enum Games {
  'CyberpunkTCG',
  'Pokemon',
  'Magic: The Gathering',
  'Star Wars Unlimited'
} 

export const contract = defineContract({}, ({ field, model, rel, gen, type }) => {
  const User = model('User', {
    fields: {
      id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
      displayname: field.column(type.String()).optional(),
      username: field.column(type.String()),
      oath: field.column(type.String()),
      createdAt: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
      updatedAt: field.column(type.temporal.UpdatedAt()),
    },
  });

  const Account = model('Account', {
    fields: {
      id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
      game: field.column(type.String()),
      content: field.column(type.String()).optional(),
      userId: field.column(type.Uuid()),
      createdAt: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
      updatedAt: field.column(type.temporal.UpdatedAt()),
    },
  });

  return {
    models: {
      User: User.relations({
        accounts: rel.hasMany(Account, { by: 'userId' }),
      }),
      Post: Account.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
      }),
    },
  };
});
