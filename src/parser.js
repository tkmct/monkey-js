// @flow

import * as ast from './ast';
import Lexer from './lexer';
import * as token from './token';

type prefixParseFn = () => ?ast.Expression;
type infixParseFn = ast.Expression => ?ast.Expression;

const LOWEST: number = 1;
const EQUALS: number = 2;
const LESSGREATER: number = 3;
const SUM: number = 4;
const PRODUCT: number = 5;
const PREFIX: number = 6;
const CALL: number = 7;

const precedences = {
  [token.EQ]: EQUALS,
  [token.NOT_EQ]: EQUALS,
  [token.LT]: LESSGREATER,
  [token.GT]: LESSGREATER,
  [token.PLUS]: SUM,
  [token.MINUS]: SUM,
  [token.SLASH]: PRODUCT,
  [token.ASTERISK]: PRODUCT,
};

export default class Parser {
  l: Lexer;

  curToken: token.Token;
  peekToken: token.Token;
  errors: Array<string>;

  prefixParseFns: Map<token.TokenType, prefixParseFn>;
  infixParseFns: Map<token.TokenType, infixParseFn>;

  constructor(l: Lexer): void {
    this.l = l;
    this.errors = [];

    this.prefixParseFns = new Map();
    this.infixParseFns = new Map();

    this.registerPrefix(token.IDENT, this.parseIdentifier.bind(this));
    this.registerPrefix(token.INT, this.parseIntegerLiteral.bind(this));
    this.registerPrefix(token.BANG, this.parsePrefixExpression.bind(this));
    this.registerPrefix(token.MINUS, this.parsePrefixExpression.bind(this));

    this.registerInfix(token.PLUS, this.parseInfixExpression.bind(this));
    this.registerInfix(token.MINUS, this.parseInfixExpression.bind(this));
    this.registerInfix(token.SLASH, this.parseInfixExpression.bind(this));
    this.registerInfix(token.ASTERISK, this.parseInfixExpression.bind(this));
    this.registerInfix(token.EQ, this.parseInfixExpression.bind(this));
    this.registerInfix(token.NOT_EQ, this.parseInfixExpression.bind(this));
    this.registerInfix(token.LT, this.parseInfixExpression.bind(this));
    this.registerInfix(token.GT, this.parseInfixExpression.bind(this));

    this.nextToken();
    this.nextToken();
  }

  nextToken(): void {
    this.curToken = this.peekToken;
    this.peekToken = this.l.nextToken();
  }

  ParseProgram(): ast.Program {
    const program: ast.Program = new ast.Program();
    program.Statements = [];

    while (this.curToken.Type !== token.EOF) {
      const stmt: ?ast.Statement = this.parseStatement();
      if (stmt) {
        program.Statements.push(stmt);
      }
      this.nextToken();
    }

    return program;
  }

  parseStatement(): ?ast.Statement {
    switch (this.curToken.Type) {
      case token.LET:
        return this.parseLetStatement();
      case token.RETURN:
        return this.parseReturnStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  parseLetStatement(): ?ast.LetStatement {
    const stmt: ast.LetStatement = new ast.LetStatement(this.curToken);
    // console.log(stmt);

    if (!this.expectPeek(token.IDENT)) {
      return null;
    }

    stmt.Name = new ast.Identifier(this.curToken, this.curToken.Literal);

    if (!this.expectPeek(token.ASSIGN)) {
      return null;
    }

    // TODO: skipping the expressions until we encounter a semicolon

    while (!this.curTokenIs(token.SEMICOLON)) {
      this.nextToken();
    }

    return stmt;
  }

  parseReturnStatement(): ?ast.ReturnStatement {
    const stmt: ast.ReturnStatement = new ast.ReturnStatement(this.curToken);

    this.nextToken();

    // TODO: skipping the expressions until we encounter a semicolon
    while (!this.curTokenIs(token.SEMICOLON)) {
      this.nextToken();
    }

    return stmt;
  }

  curTokenIs(t: token.TokenType): boolean {
    return this.curToken.Type === t;
  }

  peekTokenIs(t: token.TokenType): boolean {
    return this.peekToken.Type === t;
  }

  expectPeek(t: token.TokenType): boolean {
    if (this.peekTokenIs(t)) {
      this.nextToken();
      return true;
    }

    this.peekError(t);
    return false;
  }

  Errors(): Array<string> {
    return this.errors;
  }

  peekError(t: token.TokenType): void {
    const msg = `expected next token to be ${t}, got ${this.peekToken.Type} instead`;
    this.errors.push(msg);
  }

  registerPrefix(tokenType: token.TokenType, fn: prefixParseFn): void {
    this.prefixParseFns.set(tokenType, fn);
  }

  registerInfix(tokenType: token.TokenType, fn: infixParseFn): void {
    this.infixParseFns.set(tokenType, fn);
  }

  parseExpressionStatement(): ?ast.ExpressionStatement {
    const stmt: ast.ExpressionStatement = new ast.ExpressionStatement(this.curToken);

    const exp: ?ast.Expression = this.parseExpression(LOWEST);
    if (!exp) return null;

    stmt.Expression = exp;

    if (this.peekTokenIs(token.SEMICOLON)) {
      this.nextToken();
    }

    return stmt;
  }

  parseExpression(precedence: number): ?ast.Expression {
    const prefix: ?prefixParseFn = this.prefixParseFns.get(this.curToken.Type);
    if (!prefix) return null;

    let leftExp: ?ast.Expression = prefix();

    while (!this.peekTokenIs(token.SEMICOLON) && precedence < this.peekPrecedence()) {
      const infix: ?infixParseFn = this.infixParseFns.get(this.peekToken.Type);
      if (!infix) return leftExp;

      this.nextToken();

      if (!leftExp) return null;
      leftExp = infix(leftExp);
    }

    return leftExp;
  }

  parseIdentifier(): ast.Expression {
    return new ast.Identifier(this.curToken, this.curToken.Literal);
  }

  parseIntegerLiteral(): ast.Expression {
    const lit: ast.IntegerLiteral = new ast.IntegerLiteral(this.curToken);

    const value: number = Number(this.curToken.Literal);
    lit.Value = value;

    return lit;
  }

  noPrefixParseFnError(t: token.TokenType): void {
    const msg: string = `no prefix parse function for ${t} found`;
    this.errors.push(msg);
  }

  parsePrefixExpression(): ?ast.Expression {
    const expression: ast.PrefixExpression = new ast.PrefixExpression(
      this.curToken,
      this.curToken.Literal,
    );

    this.nextToken();

    const right: ?ast.Expression = this.parseExpression(PREFIX);
    if (!right) return null;

    expression.Right = right;

    return expression;
  }

  peekPrecedence(): number {
    return precedences[this.peekToken.Type] || LOWEST;
  }

  curPrecedence(): number {
    return precedences[this.curToken.Type] || LOWEST;
  }

  parseInfixExpression(left: ast.Expression): ?ast.Expression {
    const expression: ast.InfixExpression = new ast.InfixExpression(
      this.curToken,
      this.curToken.Literal,
      left,
    );

    const precedence: number = this.curPrecedence();
    this.nextToken();

    const exp: ?ast.Expression = this.parseExpression(precedence);
    if (!exp) return null;

    expression.Right = exp;

    return expression;
  }
}