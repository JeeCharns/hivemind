import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OtpInput from "../OtpInput";

describe("OtpInput", () => {
  const defaultProps = {
    value: "",
    onChange: jest.fn(),
    onComplete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render 6 input boxes by default", () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(6);
    });

    it("should render custom length when specified", () => {
      render(<OtpInput {...defaultProps} length={4} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(4);
    });

    it("should display value across inputs", () => {
      render(<OtpInput {...defaultProps} value="123456" />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs[0]).toHaveValue("1");
      expect(inputs[1]).toHaveValue("2");
      expect(inputs[2]).toHaveValue("3");
      expect(inputs[3]).toHaveValue("4");
      expect(inputs[4]).toHaveValue("5");
      expect(inputs[5]).toHaveValue("6");
    });

    it("should disable all inputs when disabled prop is true", () => {
      render(<OtpInput {...defaultProps} disabled />);
      const inputs = screen.getAllByRole("textbox");
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it("should apply error styling when error prop is true", () => {
      render(<OtpInput {...defaultProps} error />);
      const inputs = screen.getAllByRole("textbox");
      inputs.forEach((input) => {
        expect(input).toHaveClass("border-red-500");
      });
    });
  });

  describe("input behaviour", () => {
    it("should call onChange when digit is entered", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "1");

      expect(onChange).toHaveBeenCalledWith("1");
    });

    it("should only accept numeric input", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "a");

      expect(onChange).not.toHaveBeenCalled();
    });

    it("should call onComplete when all digits entered", async () => {
      const onComplete = jest.fn();
      let value = "";
      const onChange = jest.fn((v) => {
        value = v;
      });

      const { rerender } = render(
        <OtpInput {...defaultProps} value={value} onChange={onChange} onComplete={onComplete} />
      );

      const inputs = screen.getAllByRole("textbox");

      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
        value = value + String(i + 1);
        rerender(
          <OtpInput {...defaultProps} value={value} onChange={onChange} onComplete={onComplete} />
        );
      }

      expect(onComplete).toHaveBeenCalledWith("123456");
    });
  });

  describe("paste behaviour", () => {
    it("should handle pasting full code", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("123456");

      expect(onChange).toHaveBeenCalledWith("123456");
    });

    it("should handle pasting partial code", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("123");

      expect(onChange).toHaveBeenCalledWith("123");
    });

    it("should ignore non-numeric paste content", async () => {
      const onChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={onChange} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[0]);
      await userEvent.paste("abc123");

      expect(onChange).toHaveBeenCalledWith("123");
    });
  });

  describe("keyboard navigation", () => {
    it("should move focus to next input on digit entry", async () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.type(inputs[0], "1");

      expect(inputs[1]).toHaveFocus();
    });

    it("should move focus to previous input on backspace", async () => {
      render(<OtpInput {...defaultProps} value="12" />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[2]);
      await userEvent.keyboard("{Backspace}");

      expect(inputs[1]).toHaveFocus();
    });

    it("should support arrow key navigation", async () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole("textbox");

      await userEvent.click(inputs[2]);
      await userEvent.keyboard("{ArrowLeft}");

      expect(inputs[1]).toHaveFocus();

      await userEvent.keyboard("{ArrowRight}");

      expect(inputs[2]).toHaveFocus();
    });
  });
});
